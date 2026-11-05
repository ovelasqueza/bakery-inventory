'use client';

/**
 * Botones "Descargar PDF" y "Descargar CSV" de una sección del Modulo_Reportes.
 * Deshabilitados con estado vacío, sin reporte o mientras se genera un archivo.
 *
 * Requisitos: 13.1, 13.6, 13.7
 */

import { useState } from 'react';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Rango } from '@/lib/fechas/bogota';
import type { Reporte } from '@/lib/reportes/agregar';
import type { Seccion } from '@/lib/reportes/tablas';
import { exportarCsv, exportarPdf } from '@/lib/reportes/exportar';

type Formato = 'pdf' | 'csv';

interface BotonesExportarProps {
  reporte: Reporte | null;
  seccion: Seccion;
  rango: Rango;
  vacio: boolean;
  className?: string;
}

const claseBoton = cn(
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-lz-border bg-lz-surface px-4 py-2',
  'text-sm font-semibold text-lz-sage shadow-lz-soft transition-colors',
  'hover:bg-lz-sage-light focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-lz-surface'
);

export function BotonesExportar({ reporte, seccion, rango, vacio, className }: BotonesExportarProps) {
  const { showToast } = useToast();
  const [generando, setGenerando] = useState<Formato | null>(null);

  const deshabilitado = vacio || reporte === null || generando !== null;

  async function exportar(formato: Formato) {
    if (deshabilitado || reporte === null) return;
    setGenerando(formato);
    try {
      if (formato === 'pdf') await exportarPdf(reporte, seccion, rango);
      else exportarCsv(reporte, seccion, rango);
    } catch (error) {
      console.error('Error al exportar el reporte:', error);
      showToast('No se pudo generar el archivo', 'error');
    } finally {
      setGenerando(null);
    }
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <button
        type="button"
        className={claseBoton}
        onClick={() => exportar('pdf')}
        disabled={deshabilitado}
        aria-busy={generando === 'pdf'}
      >
        <IconoDescarga />
        {generando === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}
      </button>
      <button
        type="button"
        className={claseBoton}
        onClick={() => exportar('csv')}
        disabled={deshabilitado}
        aria-busy={generando === 'csv'}
      >
        <IconoDescarga />
        {generando === 'csv' ? 'Generando CSV…' : 'Descargar CSV'}
      </button>
    </div>
  );
}

function IconoDescarga() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
    </svg>
  );
}
