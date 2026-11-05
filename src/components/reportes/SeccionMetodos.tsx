'use client';

// Total vendido y número de ventas por Metodo_Pago, incluidos los inactivos (Req 12.6).

import { useMemo } from 'react';
import type { Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

interface SeccionMetodosProps {
  reporte: Reporte;
}

export function SeccionMetodos({ reporte }: SeccionMetodosProps) {
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'metodos', 'pantalla'), [reporte]);
  return (
    <div className="flex flex-col gap-4">
      {tablas.map((t) => (
        <TablaReporte key={t.titulo} tabla={t} />
      ))}
    </div>
  );
}

export default SeccionMetodos;
