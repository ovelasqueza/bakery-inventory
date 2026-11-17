'use client';

// Resumen del rango: total vendido, número de ventas, promedio, gastos y neto (Req 12.1),
// más vista rápida de Ventas y gastos por día y Hora pico del periodo.

import { useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

interface SeccionResumenProps {
  reporte: Reporte;
}

export function SeccionResumen({ reporte }: SeccionResumenProps) {
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'resumen', 'pantalla'), [reporte]);
  const tablasBalance = useMemo(
    () => tablasDeSeccion(reporte, 'balance-diario', 'pantalla'),
    [reporte],
  );
  const r = reporte.resumen;

  const horaPico = useMemo(
    () => [...reporte.porHora].sort((a, b) => b.total - a.total)[0] ?? null,
    [reporte.porHora],
  );

  const tarjetas: {
    etiqueta: string;
    valor: string;
    subtitulo?: string;
    peligro?: boolean;
    destaque?: boolean;
    colSpanMovil?: boolean;
  }[] = [
    { etiqueta: 'Total vendido', valor: formatCurrency(r.totalVendido), destaque: true },
    { etiqueta: 'Total gastos', valor: formatCurrency(r.totalGastos) },
    { etiqueta: 'Número de ventas', valor: String(r.numeroVentas) },
    { etiqueta: 'Promedio por venta', valor: formatCurrency(r.promedio) },
    {
      etiqueta: 'Vendido menos gastos',
      valor: formatCurrency(r.neto),
      peligro: r.neto < 0,
      colSpanMovil: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-5 sm:gap-3">
        {tarjetas.map((t) => (
          <div
            key={t.etiqueta}
            className={`flex flex-col gap-1 rounded-2xl border p-3.5 shadow-lz-soft sm:p-4 ${
              t.colSpanMovil ? 'col-span-2 lg:col-span-1' : ''
            } ${
              t.peligro
                ? 'border-lz-danger-border bg-lz-danger-surface'
                : t.destaque
                  ? 'border-lz-sage-tint bg-lz-sage-light/70'
                  : 'border-lz-border bg-lz-surface'
            }`}
          >
            <dt className="text-xs font-medium text-lz-charcoal-muted sm:text-sm">{t.etiqueta}</dt>
            <dd
              className={`font-lz-display text-lg font-bold tabular-nums sm:text-xl ${
                t.peligro ? 'text-lz-danger' : t.destaque ? 'text-lz-sage-dark' : 'text-lz-charcoal'
              }`}
            >
              {t.valor}
            </dd>
          </div>
        ))}
      </dl>

      {horaPico && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-lz-border bg-lz-surface px-4 py-3 text-xs sm:text-sm shadow-lz-soft">
          <span className="font-medium text-lz-charcoal-muted">
            Hora pico de ventas en este periodo:
          </span>
          <span className="font-lz-display font-bold text-lz-charcoal">
            {horaPico.etiqueta} —{' '}
            <span className="text-lz-sage">{formatCurrency(horaPico.total)}</span> ({horaPico.cantidad}{' '}
            {horaPico.cantidad === 1 ? 'venta' : 'ventas'})
          </span>
        </div>
      )}

      {tablas.map((t) => (
        <TablaReporte key={t.titulo} tabla={t} />
      ))}

      {tablasBalance.map((t) => (
        <TablaReporte key={t.titulo} tabla={t} />
      ))}
    </div>
  );
}

export default SeccionResumen;
