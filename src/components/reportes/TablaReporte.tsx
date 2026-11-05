'use client';

// Una Tabla de `tablasDeSeccion(..., 'pantalla')`: título, encabezado y filas.
// La pantalla muestra las mismas columnas y filas que el PDF y el CSV (Req 13.5).

import { useId, type ReactNode } from 'react';
import type { Celda, Tabla } from '@/lib/reportes/tablas';

export const TEXTO_SIN_REGISTROS = 'Sin registros';

// Números y montos con `formatCurrency` ("$ 1.234", "-$ 1.234"); no fechas ni textos.
const PATRON_NUMERICO = /^-?\s*\$?\s*-?\d[\d.,]*$/;

export function esNumerica(celda: Celda): boolean {
  if (typeof celda === 'number') return true;
  return typeof celda === 'string' && PATRON_NUMERICO.test(celda.trim());
}

interface TablaReporteProps {
  tabla: Tabla;
  /** Reemplaza el contenido de una celda (por ejemplo, una insignia). */
  renderCelda?: (celda: Celda, fila: number, columna: number) => ReactNode;
  /** Si se pasa, cada fila tiene un botón para seleccionarla. */
  onSeleccionar?: (fila: number) => void;
  seleccionada?: number | null;
  etiquetaSeleccionar?: string;
}

export function TablaReporte({
  tabla,
  renderCelda,
  onSeleccionar,
  seleccionada = null,
  etiquetaSeleccionar = 'Ver detalle',
}: TablaReporteProps) {
  const idTitulo = useId();
  const totalColumnas = tabla.columnas.length + (onSeleccionar ? 1 : 0);

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-2 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft"
    >
      <h3 id={idTitulo} className="font-lz-display text-base font-semibold text-lz-charcoal">
        {tabla.titulo}
      </h3>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-lz-border">
              {tabla.columnas.map((c, i) => (
                <th
                  key={`${i}-${c}`}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 text-left font-semibold text-lz-charcoal-muted"
                >
                  {c}
                </th>
              ))}
              {onSeleccionar && (
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Acciones</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {tabla.filas.length === 0 ? (
              <tr>
                <td colSpan={totalColumnas} className="px-3 py-3 text-center text-lz-charcoal-muted">
                  {TEXTO_SIN_REGISTROS}
                </td>
              </tr>
            ) : (
              tabla.filas.map((fila, f) => {
                const activa = seleccionada === f;
                return (
                  <tr
                    key={f}
                    className={`border-b border-lz-border last:border-b-0 ${activa ? 'bg-lz-sage-light' : ''}`}
                  >
                    {fila.map((celda, c) => {
                      const numerica = esNumerica(celda);
                      return (
                        <td
                          key={c}
                          className={`whitespace-nowrap px-3 py-2 text-lz-charcoal ${
                            numerica ? 'text-right font-lz-display tabular-nums' : 'text-left'
                          }`}
                        >
                          {renderCelda ? renderCelda(celda, f, c) : (celda ?? '')}
                        </td>
                      );
                    })}
                    {onSeleccionar && (
                      <td className="px-3 py-1 text-right">
                        <button
                          type="button"
                          aria-pressed={activa}
                          onClick={() => onSeleccionar(f)}
                          className={`min-h-[44px] min-w-[44px] whitespace-nowrap rounded-2xl border-2 px-3 text-sm font-semibold transition-colors ${
                            activa
                              ? 'border-lz-sage bg-lz-sage text-lz-surface'
                              : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
                          }`}
                        >
                          {etiquetaSeleccionar}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default TablaReporte;
