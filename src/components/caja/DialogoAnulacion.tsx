'use client';

// Diálogo para anular una venta del turno: motivo y Persona_Caja (Req 7.2, 7.5–7.8, 17.7).

import { useId, useState } from 'react';
import { anularVenta, type VentaTurno } from '@/lib/api/ventas';
import { ErrorApp } from '@/lib/api/errores';
import type { PersonaCajaParam } from '@/lib/api/parametros';
import { validarNombrePersona, validarTextoLargo } from '@/lib/caja/validacion';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import { fechaHora12, hora12 } from '@/lib/fechas/bogota';
import { formatCurrency } from '@/lib/utils';
import { AvisoSinConexion } from './AvisoSinConexion';
import { SelectorPersona } from './SelectorPersona';

const MOTIVO_MIN = 3;
const MOTIVO_MAX = 200;

interface DialogoAnulacionProps {
  venta: VentaTurno;
  personas: PersonaCajaParam[];
  /** La venta quedó anulada (o ya lo estaba): el padre recarga lista y totales. */
  onAnulada: () => void;
  onCerrar: () => void;
  /** El turno se cerró (posiblemente desde otro dispositivo). */
  onTurnoCerrado: () => void;
}

type Aviso =
  | { tipo: 'ya_anulada'; texto: string }
  | { tipo: 'turno_cerrado' }
  | { tipo: 'sin_conexion' }
  | { tipo: 'error' };

export function DialogoAnulacion({ venta, personas, onAnulada, onCerrar, onTurnoCerrado }: DialogoAnulacionProps) {
  const idTitulo = useId();
  const idMotivo = useId();
  const idErrorMotivo = useId();
  const { clave } = useClaveIdempotente(venta.id);

  const [motivo, setMotivo] = useState('');
  const [persona, setPersona] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [errorPersona, setErrorPersona] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const terminado = aviso?.tipo === 'ya_anulada' || aviso?.tipo === 'turno_cerrado';

  async function enviar() {
    if (enviando || terminado) return;

    const m = validarTextoLargo(motivo, MOTIVO_MIN, MOTIVO_MAX);
    const p = validarNombrePersona(persona);
    setErrorMotivo(
      m.ok ? null : m.error === 'CORTO'
        ? `Escriba un motivo de al menos ${MOTIVO_MIN} caracteres.`
        : `El motivo no puede pasar de ${MOTIVO_MAX} caracteres.`
    );
    setErrorPersona(
      p.ok ? null : p.error === 'VACIO' ? 'Escoja o escriba quién anula.' : 'El nombre no puede pasar de 60 caracteres.'
    );
    if (!m.ok || !p.ok) return;

    setEnviando(true);
    setAviso(null);
    try {
      const r = await anularVenta({ ventaId: venta.id, clave, motivo: m.valor, persona: p.valor });
      if (r.resultado === 'anulada') {
        onAnulada();
        return;
      }
      const quien = r.anuladaPor ? ` por ${r.anuladaPor}` : '';
      const cuando = r.anuladaEn ? ` el ${fechaHora12(r.anuladaEn)}` : '';
      setAviso({ tipo: 'ya_anulada', texto: `Esta venta ya fue anulada${quien}${cuando}.` });
    } catch (e) {
      const codigo = e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
      if (codigo === 'TURNO_CERRADO' || codigo === 'TURNO_NO_ABIERTO') setAviso({ tipo: 'turno_cerrado' });
      else if (codigo === 'SIN_CONEXION') setAviso({ tipo: 'sin_conexion' });
      else setAviso({ tipo: 'error' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-lz-charcoal/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
    >
      <div className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl bg-lz-linen p-5 shadow-lz-float sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={idTitulo} className="font-lz-display text-xl font-bold text-lz-charcoal">
              Anular venta
            </h2>
            <p className="text-sm text-lz-charcoal-muted">
              {hora12(venta.creadoEn)} · {formatCurrency(venta.total)} · {venta.metodoNombre ?? 'Método'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={enviando}
            aria-label="Cerrar"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-lz-charcoal-muted hover:bg-lz-oat disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {aviso?.tipo === 'ya_anulada' && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-lz-amber bg-lz-amber-light p-4">
            <p className="text-base font-semibold text-lz-charcoal">{aviso.texto}</p>
            <button
              type="button"
              onClick={onAnulada}
              className="min-h-[48px] rounded-2xl bg-lz-sage px-5 text-base font-semibold text-lz-surface hover:bg-lz-sage-dark"
            >
              Entendido
            </button>
          </div>
        )}

        {aviso?.tipo === 'turno_cerrado' && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface p-4">
            <p className="text-base font-semibold text-lz-danger">
              El turno ya fue cerrado. La venta no se anuló.
            </p>
            <button
              type="button"
              onClick={onTurnoCerrado}
              className="min-h-[48px] rounded-2xl bg-lz-sage px-5 text-base font-semibold text-lz-surface hover:bg-lz-sage-dark"
            >
              Entendido
            </button>
          </div>
        )}

        {!terminado && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor={idMotivo} className="font-lz-display text-base font-semibold text-lz-charcoal">
                Motivo
              </label>
              <textarea
                id={idMotivo}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={enviando}
                rows={3}
                placeholder="¿Por qué se anula?"
                aria-invalid={errorMotivo ? true : undefined}
                aria-describedby={errorMotivo ? idErrorMotivo : undefined}
                className={`min-h-[88px] w-full resize-none rounded-2xl border-2 bg-lz-surface px-4 py-3 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none disabled:opacity-50 ${
                  errorMotivo ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
                }`}
              />
              <div className="flex justify-between gap-2">
                {errorMotivo ? (
                  <p id={idErrorMotivo} role="alert" className="text-sm font-medium text-lz-danger">
                    {errorMotivo}
                  </p>
                ) : (
                  <span />
                )}
                <span className="text-xs text-lz-charcoal-muted tabular-nums">
                  {Array.from(motivo.trim()).length}/{MOTIVO_MAX}
                </span>
              </div>
            </div>

            <SelectorPersona
              personas={personas}
              value={persona}
              onChange={setPersona}
              error={errorPersona}
              etiqueta="¿Quién anula?"
              disabled={enviando}
            />

            {aviso?.tipo === 'sin_conexion' && (
              <AvisoSinConexion
                onReintentar={() => void enviar()}
                reintentando={enviando}
                mensaje="La venta no se anuló. Revise el internet y vuelva a intentar."
              />
            )}
            {aviso?.tipo === 'error' && (
              <p role="alert" className="rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3 text-base font-medium text-lz-danger">
                No se pudo anular. Intente de nuevo.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onCerrar}
                disabled={enviando}
                className="min-h-[48px] rounded-2xl border-2 border-lz-border bg-lz-surface px-5 text-base font-semibold text-lz-charcoal hover:bg-lz-oat disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="min-h-[48px] rounded-2xl bg-lz-danger px-5 text-base font-semibold text-lz-surface hover:opacity-90 disabled:opacity-50"
              >
                {enviando ? 'Anulando…' : 'Anular venta'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default DialogoAnulacion;
