'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { FilaHoraPico, Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

interface SeccionHorasPicoProps {
  reporte: Reporte;
}

type OrdenHoras = 'hora' | 'total' | 'cantidad';

interface ResumenFranja {
  id: string;
  nombre: string;
  horario: string;
  total: number;
  cantidad: number;
  porcentaje: number;
}

export function SeccionHorasPico({ reporte }: SeccionHorasPicoProps) {
  const [orden, setOrden] = useState<OrdenHoras>('total');
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'horas-pico', 'pantalla'), [reporte]);
  const porHora = reporte.porHora;
  const totalVendido = reporte.resumen.totalVendido;

  const horaPicoDinero = useMemo<FilaHoraPico | null>(
    () => [...porHora].sort((a, b) => b.total - a.total || b.cantidad - a.cantidad)[0] ?? null,
    [porHora],
  );

  const horaPicoClientes = useMemo<FilaHoraPico | null>(
    () => [...porHora].sort((a, b) => b.cantidad - a.cantidad || b.total - a.total)[0] ?? null,
    [porHora],
  );

  const top3Horas = useMemo(() => {
    const ids = [...porHora]
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map((h) => h.hora);
    return new Set(ids);
  }, [porHora]);

  const franjas = useMemo<ResumenFranja[]>(() => {
    const bloques = [
      { id: 'manana', nombre: 'Mañana', horario: '5:00 am – 11:59 am', filtro: (h: number) => h >= 5 && h < 12 },
      { id: 'tarde', nombre: 'Tarde', horario: '12:00 pm – 5:59 pm', filtro: (h: number) => h >= 12 && h < 18 },
      { id: 'noche', nombre: 'Noche', horario: '6:00 pm – 4:59 am', filtro: (h: number) => h >= 18 || h < 5 },
    ];
    return bloques.map((b) => {
      const coinciden = porHora.filter((h) => b.filtro(h.hora));
      const total = coinciden.reduce((s, x) => s + x.total, 0);
      const cantidad = coinciden.reduce((s, x) => s + x.cantidad, 0);
      const porcentaje = totalVendido === 0 ? 0 : Math.round((total / totalVendido) * 1000) / 10;
      return { id: b.id, nombre: b.nombre, horario: b.horario, total, cantidad, porcentaje };
    });
  }, [porHora, totalVendido]);

  const mejorFranja = useMemo(
    () => [...franjas].sort((a, b) => b.total - a.total)[0] ?? null,
    [franjas],
  );

  const filasOrdenadas = useMemo(() => {
    const copia = [...porHora];
    if (orden === 'total') return copia.sort((a, b) => b.total - a.total || a.hora - b.hora);
    if (orden === 'cantidad') return copia.sort((a, b) => b.cantidad - a.cantidad || b.total - a.total);
    return copia.sort((a, b) => a.hora - b.hora);
  }, [porHora, orden]);

  const maxTotal = useMemo(() => Math.max(1, ...porHora.map((h) => h.total)), [porHora]);
  const maxCantidad = useMemo(() => Math.max(1, ...porHora.map((h) => h.cantidad)), [porHora]);

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs principales de Horas Pico */}
      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <div className="flex flex-col gap-1 rounded-2xl border-2 border-lz-sage-tint bg-lz-sage-light p-3.5 shadow-lz-soft sm:p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-lz-sage-dark">
            Hora pico en dinero ($)
          </dt>
          <dd className="font-lz-display text-lg font-bold text-lz-charcoal sm:text-xl">
            {horaPicoDinero ? horaPicoDinero.etiqueta : 'Sin ventas'}
          </dd>
          {horaPicoDinero && (
            <span className="font-lz-display text-sm font-semibold tabular-nums text-lz-sage-dark">
              {formatCurrency(horaPicoDinero.total)} · {horaPicoDinero.cantidad}{' '}
              {horaPicoDinero.cantidad === 1 ? 'venta' : 'ventas'} ({horaPicoDinero.porcentaje}%)
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft sm:p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-lz-charcoal-muted">
            Hora con más clientes (# ventas)
          </dt>
          <dd className="font-lz-display text-lg font-bold text-lz-charcoal sm:text-xl">
            {horaPicoClientes ? horaPicoClientes.etiqueta : 'Sin ventas'}
          </dd>
          {horaPicoClientes && (
            <span className="font-lz-display text-sm font-semibold tabular-nums text-lz-sage">
              {horaPicoClientes.cantidad} {horaPicoClientes.cantidad === 1 ? 'venta' : 'ventas'} ·{' '}
              {formatCurrency(horaPicoClientes.total)}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft sm:p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-lz-charcoal-muted">
            Franja del día más fuerte
          </dt>
          <dd className="font-lz-display text-lg font-bold text-lz-charcoal sm:text-xl">
            {mejorFranja && mejorFranja.total > 0 ? `${mejorFranja.nombre} (${mejorFranja.porcentaje}%)` : 'Sin ventas'}
          </dd>
          {mejorFranja && mejorFranja.total > 0 && (
            <span className="text-xs text-lz-charcoal-muted">
              {mejorFranja.horario} · {formatCurrency(mejorFranja.total)}
            </span>
          )}
        </div>
      </dl>

      {/* Resumen por franjas del día (Mañana / Tarde / Noche) */}
      <section
        aria-label="Ventas por franja del día"
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3"
      >
        {franjas.map((f) => (
          <div
            key={f.id}
            className="flex flex-col gap-1.5 rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft"
          >
            <div className="flex items-center justify-between">
              <span className="font-lz-display text-sm font-bold text-lz-charcoal">{f.nombre}</span>
              <span className="rounded-lg bg-lz-oat px-2 py-0.5 font-lz-display text-xs font-bold tabular-nums text-lz-charcoal">
                {f.porcentaje}%
              </span>
            </div>
            <p className="text-xs text-lz-charcoal-muted">{f.horario}</p>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-lz-display text-base font-bold tabular-nums text-lz-sage">
                {formatCurrency(f.total)}
              </span>
              <span className="text-xs font-medium text-lz-charcoal-muted">
                {f.cantidad} {f.cantidad === 1 ? 'venta' : 'ventas'}
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* Gráfico de barras interactivo por hora */}
      <section
        aria-label="Comportamiento por hora del día"
        className="flex flex-col gap-3 rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft sm:p-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-lz-display text-base font-semibold text-lz-charcoal">
              Ranking de horas pico
            </h3>
            <p className="text-xs text-lz-charcoal-muted">
              Identifique en qué horas se concentra el mayor flujo de ventas
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ordenar horas por">
            {(
              [
                { id: 'total', etiqueta: 'Mayor venta ($)' },
                { id: 'cantidad', etiqueta: 'Más ventas (#)' },
                { id: 'hora', etiqueta: 'Orden del día' },
              ] as const
            ).map((op) => {
              const activo = orden === op.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setOrden(op.id)}
                  className={`min-h-[36px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                    activo
                      ? 'border-lz-sage bg-lz-sage text-lz-surface'
                      : 'border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-sage-light'
                  }`}
                >
                  {op.etiqueta}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {filasOrdenadas.map((h) => {
            const esPico = top3Horas.has(h.hora) && h.total > 0;
            const pctBarra =
              orden === 'cantidad'
                ? Math.round((h.cantidad / maxCantidad) * 100)
                : Math.round((h.total / maxTotal) * 100);
            return (
              <div
                key={h.hora}
                className={`flex flex-col gap-1.5 rounded-xl border p-2.5 sm:p-3 ${
                  esPico
                    ? 'border-lz-sage-tint bg-lz-sage-light/60'
                    : 'border-lz-border bg-lz-linen/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-lz-display text-sm font-bold text-lz-charcoal">
                      {h.etiqueta}
                    </span>
                    {esPico && (
                      <span className="rounded-lg bg-lz-sage px-2 py-0.5 text-[11px] font-bold text-lz-surface">
                        Hora pico
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 text-right">
                    <span className="text-xs font-medium text-lz-charcoal-muted">
                      {h.cantidad} {h.cantidad === 1 ? 'venta' : 'ventas'}
                    </span>
                    <span className="font-lz-display text-sm font-bold tabular-nums text-lz-charcoal">
                      {formatCurrency(h.total)}
                    </span>
                    <span className="min-w-[42px] text-right font-lz-display text-xs font-semibold tabular-nums text-lz-sage">
                      ({h.porcentaje}%)
                    </span>
                  </div>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-lz-oat">
                  <div
                    className={`h-full rounded-full transition-all ${
                      esPico ? 'bg-lz-sage' : 'bg-lz-sage-medium'
                    }`}
                    style={{ width: `${Math.max(pctBarra, 4)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {tablas.map((t) => (
        <TablaReporte key={t.titulo} tabla={t} />
      ))}
    </div>
  );
}

export default SeccionHorasPico;
