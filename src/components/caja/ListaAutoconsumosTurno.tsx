'use client';

// Autoconsumos del turno abierto, del más reciente al más antiguo, con opción de anular
// (Req 10.1, 10.2, 10.3). Los anulados se muestran con su hora de anulación y no suman al total.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { anularAutoconsumo, autoconsumosDelTurno, type Autoconsumo } from '@/lib/api/autoconsumo';
import { ErrorApp } from '@/lib/api/errores';
import { textoProductos } from '@/lib/caja/autoconsumo';
import { hora12 } from '@/lib/fechas/bogota';
import { formatCurrency } from '@/lib/utils';
import { AvisoSinConexion } from './AvisoSinConexion';

const MENSAJE_NO_EXISTE = 'Ese autoconsumo ya no existe.';
const MENSAJE_NO_ANULADO = 'No se pudo anular. Intente de nuevo.';

export interface ListaAutoconsumosTurnoProps {
  turnoId: string;
  /** El turno ya estaba cerrado: hay que mostrar la apertura. */
  onTurnoCerrado: () => void;
  onCerrar: () => void;
}

function codigoDe(e: unknown): string {
  return e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
}

export function ListaAutoconsumosTurno({ turnoId, onTurnoCerrado, onCerrar }: ListaAutoconsumosTurnoProps) {
  const { showToast } = useToast();
  const idTitulo = useId();
  const [registros, setRegistros] = useState<Autoconsumo[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'sin_conexion' | 'otro' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [aAnular, setAAnular] = useState<Autoconsumo | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [anularSinConexion, setAnularSinConexion] = useState(false);
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const lista = await autoconsumosDelTurno(turnoId);
      if (n !== pedido.current) return;
      setRegistros(lista);
    } catch (e) {
      if (n !== pedido.current) return;
      setError(codigoDe(e) === 'SIN_CONEXION' ? 'sin_conexion' : 'otro');
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

  function abrirAnulacion(a: Autoconsumo) {
    setErrorAnular(null);
    setAnularSinConexion(false);
    setAAnular(a);
  }

  async function anular(a: Autoconsumo) {
    setAnulando(true);
    setErrorAnular(null);
    setAnularSinConexion(false);
    try {
      await anularAutoconsumo(a.id);
      setAAnular(null);
      setAviso(null);
      showToast('Autoconsumo anulado', 'success');
      void cargar();
    } catch (e) {
      const codigo = codigoDe(e);
      if (codigo === 'TURNO_CERRADO' || codigo === 'TURNO_NO_ABIERTO') {
        setAAnular(null);
        showToast('El turno ya fue cerrado', 'warning');
        onTurnoCerrado();
      } else if (codigo === 'AUTOCONSUMO_NO_EXISTE') {
        setAAnular(null);
        setAviso(MENSAJE_NO_EXISTE);
        void cargar();
      } else if (codigo === 'SIN_CONEXION') {
        setAnularSinConexion(true);
      } else {
        setErrorAnular(MENSAJE_NO_ANULADO);
      }
    } finally {
      setAnulando(false);
    }
  }

  // Esc cierra primero la confirmación y luego la ventana.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || anulando) return;
      if (aAnular) setAAnular(null);
      else onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [aAnular, anulando, onCerrar]);

  const vigentes = (registros ?? []).filter((a) => a.anuladoEn === null);
  const total = vigentes.reduce((s, a) => s + a.valorReferencia, 0);
  const anulados = (registros?.length ?? 0) - vigentes.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-3 font-lz-sans text-lz-charcoal sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      onClick={(e) => {
        if (e.target === e.currentTarget && !aAnular) onCerrar();
      }}
    >
      <div className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-lz-linen shadow-lz-float">
        <header className="flex items-center justify-between gap-3 border-b border-lz-border bg-lz-surface px-4 py-3">
          <h2 id={idTitulo} className="font-lz-display text-xl font-bold text-lz-charcoal">
            Autoconsumos del turno
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

        <section className="grid grid-cols-2 gap-3 border-b border-lz-border bg-lz-surface px-4 py-3" aria-label="Totales de autoconsumo">
          <div>
            <p className="text-sm text-lz-charcoal-muted">Valor a precio de venta (no se cobra)</p>
            <p className="font-lz-display text-2xl font-bold text-lz-charcoal tabular-nums">
              {registros ? formatCurrency(total) : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-lz-charcoal-muted">Registros</p>
            <p className="font-lz-display text-lg font-semibold text-lz-charcoal tabular-nums">
              {registros ? vigentes.length : '—'}
              {anulados > 0 && <span className="ml-1 text-sm font-medium text-lz-danger">({anulados} anulados)</span>}
            </p>
          </div>
        </section>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {aviso && (
            <p role="alert" className="mb-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3 text-base font-medium text-lz-danger">
              {aviso}
            </p>
          )}
          {error === 'sin_conexion' && (
            <AvisoSinConexion onReintentar={() => void cargar()} reintentando={cargando} className="mb-3" />
          )}
          {error === 'otro' && (
            <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3">
              <p className="flex-1 text-base font-medium text-lz-danger">No se pudieron cargar los autoconsumos.</p>
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

          {cargando && !registros && (
            <p className="py-8 text-center text-base text-lz-charcoal-muted">Cargando autoconsumos…</p>
          )}

          {registros && registros.length === 0 && (
            <p className="py-8 text-center text-base text-lz-charcoal-muted">Todavía no hay autoconsumos en este turno.</p>
          )}

          {registros && registros.length > 0 && (
            <ul className="flex flex-col gap-2">
              {registros.map((a) => {
                const anulado = a.anuladoEn !== null;
                return (
                  <li
                    key={a.id}
                    className={`flex items-start gap-3 rounded-2xl border bg-lz-surface p-3 ${
                      anulado ? 'border-lz-danger-border' : 'border-lz-border'
                    }`}
                  >
                    <span className="w-[4.75rem] shrink-0 whitespace-nowrap pt-0.5 font-lz-display text-base font-bold tabular-nums text-lz-charcoal">
                      {hora12(a.creadoEn)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-semibold text-lz-charcoal">{a.consumidoPor}</span>
                        {anulado && a.anuladoEn && (
                          <span className="rounded-full border border-lz-danger-border bg-lz-danger-surface px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-lz-danger">
                            Anulado {hora12(a.anuladoEn)}
                          </span>
                        )}
                      </p>
                      <p className={`break-words text-sm ${anulado ? 'text-lz-charcoal-muted line-through' : 'text-lz-charcoal'}`}>
                        {textoProductos(a.lineas)}
                      </p>
                      {a.nota && <p className="break-words text-sm text-lz-charcoal-muted">{a.nota}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`font-lz-display text-lg font-bold tabular-nums ${
                          anulado ? 'text-lz-charcoal-muted line-through' : 'text-lz-charcoal'
                        }`}
                      >
                        {formatCurrency(a.valorReferencia)}
                      </span>
                      {!anulado && (
                        <button
                          type="button"
                          onClick={() => abrirAnulacion(a)}
                          disabled={anulando}
                          className="min-h-[44px] min-w-[44px] rounded-xl border-2 border-lz-danger-border px-4 text-sm font-semibold text-lz-danger hover:bg-lz-danger-surface disabled:opacity-50"
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Confirmación de anulación (Req 10.3) */}
      {aAnular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Anular autoconsumo"
            className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-lz-surface p-6 shadow-lz-float"
          >
            <h3 className="font-lz-display text-xl font-bold text-lz-charcoal">¿Anular este autoconsumo?</h3>
            <p className="break-words text-base text-lz-charcoal">
              {hora12(aAnular.creadoEn)} · {aAnular.consumidoPor} · {textoProductos(aAnular.lineas)} ·{' '}
              <span className="font-bold tabular-nums">{formatCurrency(aAnular.valorReferencia)}</span>
            </p>
            {anularSinConexion && (
              <AvisoSinConexion onReintentar={() => void anular(aAnular)} reintentando={anulando} />
            )}
            {errorAnular && (
              <p role="alert" className="text-sm font-semibold text-lz-danger">
                {errorAnular}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setAAnular(null)}
                disabled={anulando}
                className="min-h-[48px] min-w-[44px] rounded-2xl border-2 border-lz-border px-5 text-base font-semibold text-lz-charcoal hover:bg-lz-sage-light disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void anular(aAnular)}
                disabled={anulando}
                className="min-h-[48px] min-w-[44px] rounded-2xl bg-lz-danger px-5 text-base font-bold text-lz-surface disabled:opacity-50"
              >
                {anulando ? 'Anulando…' : 'Anular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ListaAutoconsumosTurno;
