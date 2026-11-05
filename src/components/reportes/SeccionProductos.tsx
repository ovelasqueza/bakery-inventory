'use client';

// Productos vendidos con cantidad y valor, sin ventas anuladas (Req 12.3).

import { useMemo } from 'react';
import type { Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

interface SeccionProductosProps {
  reporte: Reporte;
}

export function SeccionProductos({ reporte }: SeccionProductosProps) {
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'productos', 'pantalla'), [reporte]);
  return (
    <div className="flex flex-col gap-4">
      {tablas.map((t) => (
        <TablaReporte key={t.titulo} tabla={t} />
      ))}
    </div>
  );
}

export default SeccionProductos;
