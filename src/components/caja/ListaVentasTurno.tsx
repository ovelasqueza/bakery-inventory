'use client';

// Ventas del turno abierto, de la más reciente a la más antigua, con opción de anular (Req 7.1, 7.4, 17.7, 6.9).

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { detalleVenta, ventasDelTurno, type DetalleLinea, type VentaTurno } from '@/lib/api/ventas';
import { ErrorApp } from '@/lib/api/errores';
import type { PersonaCajaParam } from '@/lib/api/parametros';
import { hora12, fechaHora12 } from '@/lib/fechas/bogota';
import { ENCABEZADO_RECIBO } from '@/lib/recibo/config';
import { bytesReciboVenta, mensajeImpresionVenta } from '@/lib/recibo/reciboVenta';
import { imprimirEnAgente } from '@/lib/cajon';
import { formatCurrency } from '@/lib/utils';
import { AvisoSinConexion } from './AvisoSinConexion';
import { DialogoAnulacion } from './DialogoAnulacion';

interface ListaVentasTurnoProps {
  turnoId: string;
  personas: PersonaCajaParam[];
  /** Se anuló una venta: el padre recalcula los totales del turno. */
  onCambio: () => void;
  onTurnoCerrado: () => void;
  onCerrar: () => void;
}

type EstadoDetalle =
  | { estado: 'cargando' }
  | { estado: 'listo'; lineas: DetalleLinea[] }
  | { estado: 'error' };

function EtiquetaEstado({ anulada }: { anulada: boolean }) {
  return anulada ? (
    <span className="rounded-full border border-lz-danger-border bg-lz-danger-surface px-3 py-1 text-xs font-bold uppercase tracking-wide text-lz-danger">
      Anulada
    </span>
  ) : (
    <span className="rounded-full bg-lz-sage-light px-3 py-1 text-xs font-bold uppercase tracking-wide text-lz-sage">
      Registrada
    </span>
  );
}

export function ListaVentasTurno({ turnoId, personas, onCambio, onTurnoCerrado, onCerrar }: ListaVentasTurnoProps) {
  const { showToast } = useToast();
  const idTitulo = useId();
  const [ventas, setVentas] = useState<VentaTurno[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'sin_conexion' | 'otro' | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, EstadoDetalle>>({});
  const [aAnular, setAAnular] = useState<VentaTurno | null>(null);
  const [previsualizando, setPrevisualizando] = useState<VentaTurno | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const pedido = useRef(0);

  async function asegurarDetalle(id: string): Promise<DetalleLinea[] | null> {
    const actual = detalles[id];
    if (actual?.estado === 'listo') return actual.lineas;
    setDetalles((d) => ({ ...d, [id]: { estado: 'cargando' } }));
    try {
      const r = await detalleVenta(id);
      setDetalles((d) => ({ ...d, [id]: { estado: 'listo', lineas: r.detalles } }));
      return r.detalles;
    } catch {
      setDetalles((d) => ({ ...d, [id]: { estado: 'error' } }));
      return null;
    }
  }

  function abrirPrevisualizacion(v: VentaTurno) {
    setPrevisualizando(v);
    void asegurarDetalle(v.id);
  }

  async function confirmarImpresionYVolver() {
    if (!previsualizando || imprimiendo) return;
    setImprimiendo(true);
    try {
      const lineas = await asegurarDetalle(previsualizando.id);
      if (!lineas) {
        showToast('No se pudieron leer los datos de la venta para imprimir.', 'warning');
        return;
      }
      const bytes = bytesReciboVenta(
        {
          venta: {
            id: previsualizando.id,
            creadoEn: previsualizando.creadoEn,
            total: previsualizando.total,
            metodoPagoId: previsualizando.metodoPagoId,
            esEfectivo: previsualizando.esEfectivo,
            efectivoRecibido: previsualizando.efectivoRecibido,
            cambio: previsualizando.cambio,
            estado: previsualizando.estado,
            anuladaEn: previsualizando.anuladaEn,
            anuladaPor: previsualizando.anuladaPor,
            motivoAnulacion: previsualizando.motivoAnulacion,
            turnoId,
            tipo: previsualizando.tipo,
          },
          detalles: lineas,
        },
        previsualizando.metodoNombre
      );
      const r = await imprimirEnAgente(bytes);
      showToast(mensajeImpresionVenta(r), r.ok ? 'success' : 'warning');
      setPrevisualizando(null);
      onCerrar();
    } finally {
      setImprimiendo(false);
    }
  }

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const lista = await ventasDelTurno(turnoId);
      if (n !== pedido.current) return;
      setVentas(lista);
    } catch (e) {
      if (n !== pedido.current) return;
      setError(e instanceof ErrorApp && e.codigo === 'SIN_CONEXION' ? 'sin_conexion' : 'otro');
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, [turnoId]);

  useEffect(() => {
    const contador = pedido;
    void cargar();
    // Invalida respuestas pendientes al desmontar o cambiar de turno.
    return () => {
      contador.current++;
    };
  }, [cargar]);

  async function alternarDetalle(id: string) {
    if (abierta === id) {
      setAbierta(null);
      return;
    }
    setAbierta(id);
    const actual = detalles[id];
    if (actual && actual.estado !== 'error') return;
    setDetalles((d) => ({ ...d, [id]: { estado: 'cargando' } }));
    try {
      const r = await detalleVenta(id);
      setDetalles((d) => ({ ...d, [id]: { estado: 'listo', lineas: r.detalles } }));
    } catch {
      setDetalles((d) => ({ ...d, [id]: { estado: 'error' } }));
    }
  }

  function trasAnular() {
    setAAnular(null);
    onCambio();
    void cargar();
  }

  function trasTurnoCerrado() {
    setAAnular(null);
    onTurnoCerrado();
  }

  // Esc cierra primero la previsualización o anulación, y si no la ventana de ventas.
  useEffect(() => {
    if (aAnular) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || imprimiendo) return;
      if (previsualizando) setPrevisualizando(null);
      else onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [aAnular, imprimiendo, onCerrar, previsualizando]);

  const registradas = (ventas ?? []).filter((v) => v.estado === 'registrada');
  const total = registradas.reduce((s, v) => s + v.total, 0);
  const anuladas = (ventas?.length ?? 0) - registradas.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      onClick={(e) => {
        if (e.target === e.currentTarget && !aAnular) onCerrar();
      }}
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-lz-linen shadow-lz-float">
        <header className="flex items-center justify-between gap-3 border-b border-lz-border bg-lz-surface px-4 py-3">
          <h2 id={idTitulo} className="font-lz-display text-xl font-bold text-lz-charcoal">
            Ventas del turno
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-lz-charcoal-muted hover:bg-lz-oat"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <section className="grid grid-cols-2 gap-3 border-b border-lz-border bg-lz-surface px-4 py-3" aria-label="Totales del turno">
          <div>
            <p className="text-sm text-lz-charcoal-muted">Total vendido</p>
            <p className="font-lz-display text-2xl font-bold text-lz-sage tabular-nums">
              {ventas ? formatCurrency(total) : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-lz-charcoal-muted">Ventas</p>
            <p className="font-lz-display text-lg font-semibold text-lz-charcoal tabular-nums">
              {ventas ? registradas.length : '—'}
              {anuladas > 0 && <span className="ml-1 text-sm font-medium text-lz-danger">({anuladas} anuladas)</span>}
            </p>
          </div>
        </section>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error === 'sin_conexion' && (
            <AvisoSinConexion onReintentar={() => void cargar()} reintentando={cargando} className="mb-3" />
          )}
          {error === 'otro' && (
            <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3">
              <p className="flex-1 text-base font-medium text-lz-danger">No se pudieron cargar las ventas.</p>
              <button
                type="button"
                onClick={() => void cargar()}
                disabled={cargando}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface hover:bg-lz-sage-dark disabled:opacity-50"
              >
                Reintentar
              </button>
            </div>
          )}

          {cargando && !ventas && <p className="py-8 text-center text-base text-lz-charcoal-muted">Cargando ventas…</p>}

          {ventas && ventas.length === 0 && (
            <p className="py-8 text-center text-base text-lz-charcoal-muted">Todavía no hay ventas en este turno.</p>
          )}

          {ventas && ventas.length > 0 && (
            <ul className="flex flex-col gap-2">
              {ventas.map((v) => {
                const anulada = v.estado === 'anulada';
                const det = detalles[v.id];
                const expandida = abierta === v.id;
                return (
                  <li key={v.id} className={`rounded-2xl border bg-lz-surface ${anulada ? 'border-lz-danger-border' : 'border-lz-border'}`}>
                    <div className="flex items-center gap-2 p-2">
                      <button
                        type="button"
                        onClick={() => void alternarDetalle(v.id)}
                        aria-expanded={expandida}
                        className="flex min-h-[48px] flex-1 items-center gap-3 rounded-xl px-2 text-left hover:bg-lz-oat"
                      >
                        <span className="font-lz-display text-lg font-bold text-lz-charcoal tabular-nums">{hora12(v.creadoEn)}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block font-semibold tabular-nums ${anulada ? 'text-lz-charcoal-muted line-through' : 'text-lz-charcoal'}`}>
                            {formatCurrency(v.total)}
                          </span>
                          <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-lz-charcoal-muted">
                            <span className="whitespace-nowrap font-semibold text-lz-charcoal">
                              {v.metodoNombre ?? (v.esEfectivo ? 'Efectivo' : 'Método')}
                            </span>
                            {v.tipo === 'valor' && (
                              <span className="shrink-0 rounded-full bg-lz-oat px-2 py-0.5 text-xs font-semibold text-lz-charcoal">
                                Venta por valor
                              </span>
                            )}
                          </span>
                        </span>
                        <EtiquetaEstado anulada={anulada} />
                      </button>
                      {!anulada && (
                        <>
                          <button
                            type="button"
                            onClick={() => abrirPrevisualizacion(v)}
                            title="Ver previsualización e imprimir tiquete"
                            className="min-h-[48px] min-w-[44px] rounded-xl border-2 border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal hover:bg-lz-sage-light hover:text-lz-sage"
                          >
                            Imprimir
                          </button>
                          <button
                            type="button"
                            onClick={() => setAAnular(v)}
                            className="min-h-[48px] min-w-[44px] rounded-xl border-2 border-lz-danger-border px-4 text-sm font-semibold text-lz-danger hover:bg-lz-danger-surface"
                          >
                            Anular
                          </button>
                        </>
                      )}
                    </div>

                    {expandida && (
                      <div className="border-t border-lz-border px-4 py-3 text-sm text-lz-charcoal">
                        {det?.estado === 'cargando' && <p className="text-lz-charcoal-muted">Cargando detalle…</p>}
                        {det?.estado === 'error' && <p className="text-lz-danger">No se pudo cargar el detalle.</p>}
                        {det?.estado === 'listo' && (
                          <ul className="flex flex-col gap-1">
                            {det.lineas.map((l, i) => (
                              <li key={i} className="flex justify-between gap-2">
                                <span className="min-w-0 truncate">
                                  {/* Las líneas de una venta por valor se muestran sin "1 ×", en el orden recibido (Req 6.9). */}
                                  {v.tipo === 'valor' || l.productoId === null
                                    ? 'Venta por valor'
                                    : `${l.cantidad} × ${l.nombreProducto}`}
                                </span>
                                <span className="tabular-nums">{formatCurrency(l.subtotal)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {v.esEfectivo && (
                          <p className="mt-2 text-lz-charcoal-muted">
                            Recibido {formatCurrency(v.efectivoRecibido)} · Cambio {formatCurrency(v.cambio)}
                          </p>
                        )}
                        {anulada && (
                          <p className="mt-2 text-lz-danger">
                            Anulada{v.anuladaPor ? ` por ${v.anuladaPor}` : ''}
                            {v.anuladaEn ? ` a las ${hora12(v.anuladaEn)}` : ''}
                            {v.motivoAnulacion ? `: ${v.motivoAnulacion}` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {previsualizando && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-lz-charcoal/60 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Previsualización de impresión del tiquete"
          onClick={(e) => {
            if (e.target === e.currentTarget && !imprimiendo) setPrevisualizando(null);
          }}
        >
          <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-3xl bg-lz-linen shadow-lz-float">
            <header className="flex items-center justify-between gap-2 border-b border-lz-border bg-lz-surface px-4 py-3">
              <h3 className="font-lz-display text-lg font-bold text-lz-charcoal">
                Previsualización del tiquete
              </h3>
              <button
                type="button"
                disabled={imprimiendo}
                onClick={() => setPrevisualizando(null)}
                className="min-h-[40px] rounded-xl px-3 text-sm font-semibold text-lz-charcoal-muted hover:bg-lz-oat"
              >
                ← Volver a la lista
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              {/* Tiquete visual estilo papel térmico 80mm */}
              <div className="mx-auto w-full max-w-xs rounded-2xl border border-lz-border bg-white p-4 font-mono text-xs leading-relaxed text-lz-charcoal shadow-lz-soft">
                <div className="text-center">
                  <p className="text-sm font-bold tracking-wide">{ENCABEZADO_RECIBO.nombre}</p>
                  <p className="text-[11px] text-lz-charcoal-muted">{ENCABEZADO_RECIBO.linea2}</p>
                  <p className="mt-1 font-bold">Tiquete de venta</p>
                </div>

                <div className="my-2 border-b border-dashed border-lz-charcoal/40" />

                <div className="flex justify-between gap-2 text-[11px]">
                  <span>Fecha:</span>
                  <span className="tabular-nums">{fechaHora12(previsualizando.creadoEn)}</span>
                </div>
                <div className="flex justify-between gap-2 text-[11px]">
                  <span>Método de pago:</span>
                  <span>{previsualizando.metodoNombre ?? (previsualizando.esEfectivo ? 'Efectivo' : 'Método')}</span>
                </div>

                <div className="my-2 border-b border-dashed border-lz-charcoal/40" />

                {detalles[previsualizando.id]?.estado === 'cargando' ? (
                  <p className="py-4 text-center text-lz-charcoal-muted">Cargando líneas del tiquete…</p>
                ) : detalles[previsualizando.id]?.estado === 'error' ? (
                  <div className="flex flex-col items-center gap-2 py-3 text-center">
                    <p className="text-lz-danger">No se pudo cargar el detalle.</p>
                    <button
                      type="button"
                      onClick={() => void asegurarDetalle(previsualizando.id)}
                      className="rounded-lg bg-lz-sage px-3 py-1 font-sans text-xs font-semibold text-lz-surface"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {(detalles[previsualizando.id]?.estado === 'listo'
                      ? (detalles[previsualizando.id] as { estado: 'listo'; lineas: DetalleLinea[] }).lineas
                      : []
                    ).map((l, idx) => (
                      <li key={idx} className="flex justify-between gap-2">
                        <span className="min-w-0 break-words">
                          {previsualizando.tipo === 'valor' || l.productoId === null
                            ? 'Venta por valor'
                            : `${l.cantidad} x ${l.nombreProducto}`}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatCurrency(l.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="my-2 border-b border-dashed border-lz-charcoal/40" />

                <div className="flex justify-between gap-2 text-sm font-bold">
                  <span>TOTAL</span>
                  <span className="tabular-nums">{formatCurrency(previsualizando.total)}</span>
                </div>

                {previsualizando.esEfectivo && (
                  <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <span>Efectivo recibido</span>
                      <span className="tabular-nums">{formatCurrency(previsualizando.efectivoRecibido)}</span>
                    </div>
                    <div className="flex justify-between gap-2 font-bold">
                      <span>Cambio</span>
                      <span className="tabular-nums">{formatCurrency(previsualizando.cambio)}</span>
                    </div>
                  </div>
                )}

                <div className="my-2 border-b border-dashed border-lz-charcoal/40" />
                <p className="text-center text-[11px]">¡Gracias por su compra!</p>
              </div>
            </div>

            <footer className="flex flex-col gap-2 border-t border-lz-border bg-lz-surface p-4">
              <button
                type="button"
                disabled={imprimiendo || detalles[previsualizando.id]?.estado === 'cargando'}
                onClick={() => void confirmarImpresionYVolver()}
                className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-lz-sage px-5 font-lz-display text-base font-bold text-lz-surface shadow-lz-float transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9V2h12v7" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                {imprimiendo ? 'Imprimiendo…' : 'Imprimir y volver a la venta'}
              </button>
              <button
                type="button"
                disabled={imprimiendo}
                onClick={() => {
                  setPrevisualizando(null);
                  onCerrar();
                }}
                className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 border-lz-border bg-lz-surface px-4 text-sm font-semibold text-lz-charcoal hover:bg-lz-oat disabled:opacity-50"
              >
                Cerrar todo y volver a la venta
              </button>
            </footer>
          </div>
        </div>
      )}

      {aAnular && (
        <DialogoAnulacion
          venta={aAnular}
          personas={personas}
          onAnulada={trasAnular}
          onCerrar={() => setAAnular(null)}
          onTurnoCerrado={trasTurnoCerrado}
        />
      )}
    </div>
  );
}

export default ListaVentasTurno;
