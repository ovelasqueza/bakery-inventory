'use client';

// Una Tabla de `tablasDeSeccion(..., 'pantalla')`: título, encabezado y filas.
// En pantallas pequeñas (móvil), las tablas anchas (4+ columnas) se muestran también
// como tarjetas compactas fáciles de leer sin desplazarse horizontalmente.

import { useId, type ReactNode } from 'react';
import type { Celda, Tabla } from '@/lib/reportes/tablas';

export const TEXTO_SIN_REGISTROS = 'Sin registros';

// Números y montos con `formatCurrency` ("$ 1.234", "-$ 1.234"); no fechas ni textos.
const PATRON_NUMERICO = /^-?\s*\$?\s*-?\d[\d.,]*%?$/;

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
  const usarTarjetasMovil = tabla.columnas.length >= 4;

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-2.5 rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft sm:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={idTitulo} className="font-lz-display text-base font-semibold text-lz-charcoal">
          {tabla.titulo}
        </h3>
        {tabla.filas.length > 0 && (
          <span className="rounded-lg bg-lz-linen px-2 py-0.5 text-xs font-medium text-lz-charcoal-muted">
            {tabla.filas.length} {tabla.filas.length === 1 ? 'registro' : 'registros'}
          </span>
        )}
      </div>

      {/* Vista móvil en tarjetas para tablas anchas (4 o más columnas) */}
      {usarTarjetasMovil && (
        <div className="flex flex-col gap-2 sm:hidden">
          {tabla.filas.length === 0 ? (
            <p className="py-4 text-center text-sm text-lz-charcoal-muted">{TEXTO_SIN_REGISTROS}</p>
          ) : (
            tabla.filas.map((fila, f) => {
              const activa = seleccionada === f;
              return (
                <div
                  key={f}
                  className={`flex flex-col gap-2 rounded-xl border p-3 ${
                    activa
                      ? 'border-lz-sage bg-lz-sage-light'
                      : 'border-lz-border bg-lz-linen/50'
                  }`}
                >
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    {fila.map((celda, c) => {
                      const colNombre = tabla.columnas[c] ?? '';
                      const contenido = renderCelda ? renderCelda(celda, f, c) : (celda ?? '-');
                      const numerica = esNumerica(celda);
                      return (
                        <div key={c} className="flex flex-col">
                          <span className="text-[11px] font-medium text-lz-charcoal-muted">
                            {colNombre}
                          </span>
                          <span
                            className={`font-semibold text-lz-charcoal ${
                              numerica ? 'font-lz-display tabular-nums' : 'break-words'
                            }`}
                          >
                            {contenido === '' || contenido === null ? '-' : contenido}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {onSeleccionar && (
                    <button
                      type="button"
                      aria-pressed={activa}
                      onClick={() => onSeleccionar(f)}
                      className={`mt-1 min-h-[38px] w-full rounded-xl border-2 px-3 text-xs font-semibold transition-colors ${
                        activa
                          ? 'border-lz-sage bg-lz-sage text-lz-surface'
                          : 'border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-sage-light'
                      }`}
                    >
                      {etiquetaSeleccionar}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tabla estándar (siempre en escritorio y en móvil para tablas de 2–3 columnas) */}
      <div className={`${usarTarjetasMovil ? 'hidden sm:block' : 'block'} -mx-3.5 overflow-x-auto px-3.5 sm:-mx-4 sm:px-4`}>
        <table className="w-full border-collapse text-xs sm:min-w-max sm:text-sm">
          <thead>
            <tr className="border-b-2 border-lz-border">
              {tabla.columnas.map((c, i) => (
                <th
                  key={`${i}-${c}`}
                  scope="col"
                  className="whitespace-nowrap px-2 py-2 text-left font-semibold text-lz-charcoal-muted sm:px-3"
                >
                  {c}
                </th>
              ))}
              {onSeleccionar && (
                <th scope="col" className="px-2 py-2 sm:px-3">
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
                          className={`px-2 py-2 text-lz-charcoal sm:whitespace-nowrap sm:px-3 ${
                            numerica ? 'whitespace-nowrap text-right font-lz-display tabular-nums' : 'text-left'
                          }`}
                        >
                          {renderCelda ? renderCelda(celda, f, c) : (celda ?? '')}
                        </td>
                      );
                    })}
                    {onSeleccionar && (
                      <td className="px-2 py-1 text-right sm:px-3">
                        <button
                          type="button"
                          aria-pressed={activa}
                          onClick={() => onSeleccionar(f)}
                          className={`min-h-[36px] whitespace-nowrap rounded-xl border-2 px-2.5 text-xs font-semibold transition-colors sm:min-h-[40px] sm:rounded-2xl sm:px-3 sm:text-sm ${
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
