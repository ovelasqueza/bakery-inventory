'use client';

import { useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

interface SeccionBalanceDiarioProps {
  reporte: Reporte;
}

function formatearFechaCorta(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

export function SeccionBalanceDiario({ reporte }: SeccionBalanceDiarioProps) {
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'balance-diario', 'pantalla'), [reporte]);
  const filas = reporte.balancePorDia;

  const maxMonto = useMemo(
    () => Math.max(1, ...filas.map((d) => Math.max(d.ventasTotal, d.gastosTotal))),
    [filas],
  );

  const mejorDia = useMemo(
    () => [...filas].sort((a, b) => b.ventasTotal - a.ventasTotal)[0] ?? null,
    [filas],
  );

  const r = reporte.resumen;

  return (
    <div className="flex flex-col gap-4">
      {/* Tarjetas de resumen consolidado */}
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <div className="flex flex-col gap-1 rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft sm:p-4">
          <dt className="text-xs font-medium text-lz-charcoal-muted sm:text-sm">Total ventas</dt>
          <dd className="font-lz-display text-lg font-bold tabular-nums text-lz-sage sm:text-xl">
            {formatCurrency(r.totalVendido)}
          </dd>
          <span className="text-xs text-lz-charcoal-muted">{r.numeroVentas} ventas en el periodo</span>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft sm:p-4">
          <dt className="text-xs font-medium text-lz-charcoal-muted sm:text-sm">Total gastos</dt>
          <dd className="font-lz-display text-lg font-bold tabular-nums text-lz-danger sm:text-xl">
            {formatCurrency(r.totalGastos)}
          </dd>
          <span className="text-xs text-lz-charcoal-muted">{reporte.gastos.length} gastos registrados</span>
        </div>

        <div
          className={`flex flex-col gap-1 rounded-2xl border p-3.5 shadow-lz-soft sm:p-4 ${
            r.neto < 0
              ? 'border-lz-danger-border bg-lz-danger-surface'
              : 'border-lz-sage-tint bg-lz-sage-light'
          }`}
        >
          <dt className="text-xs font-medium text-lz-charcoal-muted sm:text-sm">Balance neto (Ventas − Gastos)</dt>
          <dd
            className={`font-lz-display text-lg font-bold tabular-nums sm:text-xl ${
              r.neto < 0 ? 'text-lz-danger' : 'text-lz-charcoal'
            }`}
          >
            {formatCurrency(r.neto)}
          </dd>
          <span className="text-xs text-lz-charcoal-muted">
            {filas.length} {filas.length === 1 ? 'día con movimiento' : 'días con movimiento'}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft sm:p-4">
          <dt className="text-xs font-medium text-lz-charcoal-muted sm:text-sm">Mejor día de ventas</dt>
          <dd className="font-lz-display text-base font-bold text-lz-charcoal sm:text-lg">
            {mejorDia ? `${mejorDia.diaSemana} (${formatearFechaCorta(mejorDia.dia)})` : 'Sin datos'}
          </dd>
          {mejorDia && (
            <span className="font-lz-display text-xs font-semibold tabular-nums text-lz-sage">
              {formatCurrency(mejorDia.ventasTotal)} ({mejorDia.ventasCantidad} ventas)
            </span>
          )}
        </div>
      </dl>

      {/* Comparativo visual día por día (ideal para móvil y escritorio) */}
      <section
        aria-label="Comparativo diario de ventas y gastos"
        className="flex flex-col gap-3 rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft sm:p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-lz-display text-base font-semibold text-lz-charcoal">
            Detalle día por día (Ventas vs. Gastos)
          </h3>
          <div className="flex items-center gap-3 text-xs font-medium text-lz-charcoal-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-lz-sage" /> Ventas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-lz-danger" /> Gastos
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {[...filas].reverse().map((d) => {
            const pctVentas = Math.round((d.ventasTotal / maxMonto) * 100);
            const pctGastos = Math.round((d.gastosTotal / maxMonto) * 100);
            return (
              <div
                key={d.dia}
                className="flex flex-col gap-2 rounded-xl border border-lz-border bg-lz-linen/60 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-lz-display text-sm font-bold text-lz-charcoal">
                      {d.diaSemana}
                    </span>{' '}
                    <span className="text-xs font-medium text-lz-charcoal-muted">
                      ({formatearFechaCorta(d.dia)})
                    </span>
                  </div>
                  <span
                    className={`rounded-lg px-2.5 py-0.5 font-lz-display text-xs font-bold tabular-nums ${
                      d.neto < 0
                        ? 'bg-lz-danger-surface text-lz-danger'
                        : 'bg-lz-sage-light text-lz-sage-dark'
                    }`}
                  >
                    Neto: {formatCurrency(d.neto)}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-3">
                  {/* Barra Ventas */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-lz-charcoal-muted">
                        Ventas ({d.ventasCantidad})
                      </span>
                      <span className="font-lz-display font-bold tabular-nums text-lz-sage">
                        {formatCurrency(d.ventasTotal)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-lz-oat">
                      <div
                        className="h-full rounded-full bg-lz-sage transition-all"
                        style={{ width: `${Math.max(pctVentas, d.ventasTotal > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Barra Gastos */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-lz-charcoal-muted">
                        Gastos ({d.gastosCantidad})
                      </span>
                      <span className="font-lz-display font-bold tabular-nums text-lz-danger">
                        {formatCurrency(d.gastosTotal)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-lz-oat">
                      <div
                        className="h-full rounded-full bg-lz-danger transition-all"
                        style={{ width: `${Math.max(pctGastos, d.gastosTotal > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
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

export default SeccionBalanceDiario;
