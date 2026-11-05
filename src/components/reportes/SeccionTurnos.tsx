'use client';

// Turnos del rango; los Turno_Abierto llevan la insignia "Abierto" (Req 12.4).

import { useMemo } from 'react';
import type { Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion, type Celda } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

interface SeccionTurnosProps {
  reporte: Reporte;
}

// La primera columna de la tabla de Turnos es el estado.
function celdaTurno(celda: Celda, _fila: number, columna: number) {
  if (columna === 0 && celda === 'Abierto') {
    return (
      <span className="inline-flex items-center rounded-full border border-lz-amber bg-lz-amber-light px-2 py-0.5 text-xs font-semibold text-lz-charcoal">
        Abierto
      </span>
    );
  }
  return celda ?? '';
}

export function SeccionTurnos({ reporte }: SeccionTurnosProps) {
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'turnos', 'pantalla'), [reporte]);
  return (
    <div className="flex flex-col gap-4">
      {tablas.map((t) => (
        <TablaReporte key={t.titulo} tabla={t} renderCelda={celdaTurno} />
      ))}
    </div>
  );
}

export default SeccionTurnos;
