'use client';

// Resumen del rango: total vendido, número de ventas, promedio, gastos y neto (Req 12.1).

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
  const r = reporte.resumen;

  const tarjetas: { etiqueta: string; valor: string; peligro?: boolean }[] = [
    { etiqueta: 'Total vendido', valor: formatCurrency(r.totalVendido) },
    { etiqueta: 'Número de ventas', valor: String(r.numeroVentas) },
    { etiqueta: 'Promedio por venta', valor: formatCurrency(r.promedio) },
    { etiqueta: 'Total gastos', valor: formatCurrency(r.totalGastos) },
    { etiqueta: 'Vendido menos gastos', valor: formatCurrency(r.neto), peligro: r.neto < 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tarjetas.map((t) => (
          <div
            key={t.etiqueta}
            className={`flex flex-col gap-1 rounded-2xl border p-4 shadow-lz-soft ${
              t.peligro ? 'border-lz-danger-border bg-lz-danger-surface' : 'border-lz-border bg-lz-surface'
            }`}
          >
            <dt className="text-sm font-medium text-lz-charcoal-muted">{t.etiqueta}</dt>
            <dd
              className={`font-lz-display text-xl font-semibold tabular-nums ${
                t.peligro ? 'text-lz-danger' : 'text-lz-charcoal'
              }`}
            >
              {t.valor}
            </dd>
          </div>
        ))}
      </dl>
      {tablas.map((t) => (
        <TablaReporte key={t.titulo} tabla={t} />
      ))}
    </div>
  );
}

export default SeccionResumen;
