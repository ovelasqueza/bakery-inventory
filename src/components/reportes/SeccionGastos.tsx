'use client';

// Lista de Gastos del rango y total por Categoria_Gasto (Req 12.5).

import { useMemo } from 'react';
import type { Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

interface SeccionGastosProps {
  reporte: Reporte;
}

export function SeccionGastos({ reporte }: SeccionGastosProps) {
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'gastos', 'pantalla'), [reporte]);
  return (
    <div className="flex flex-col gap-4">
      {tablas.map((t) => (
        <TablaReporte key={t.titulo} tabla={t} />
      ))}
    </div>
  );
}

export default SeccionGastos;
