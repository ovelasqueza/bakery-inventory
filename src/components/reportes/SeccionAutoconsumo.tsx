'use client';

// Autoconsumos no anulados del rango, total por producto y por persona (Req 12.2, 12.3, 12.4).

import { useMemo } from 'react';
import type { Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

interface SeccionAutoconsumoProps {
  reporte: Reporte;
}

export function SeccionAutoconsumo({ reporte }: SeccionAutoconsumoProps) {
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'autoconsumo', 'pantalla'), [reporte]);
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-2xl border border-lz-border bg-lz-sage-light px-4 py-3 text-sm text-lz-charcoal">
        Valores a precio de venta, no es dinero recibido.
      </p>
      {tablas.map((t) => (
        <TablaReporte key={t.titulo} tabla={t} />
      ))}
    </div>
  );
}

export default SeccionAutoconsumo;
