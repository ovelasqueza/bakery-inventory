'use client';

// Ajuste manual de una Parte de la caja mayor: suma o quita con motivo obligatorio (Req 8.4, 8.5, 8.9).
// Un saldo que quedaría negativo lo rechaza el servidor con SALDO_INSUFICIENTE.

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';
import { SelectorPersona } from '@/components/caja/SelectorPersona';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import { ajustarCajaMayor, type ParteCajaMayor } from '@/lib/api/cajaMayor';
import { ErrorApp, parteDeError } from '@/lib/api/errores';
import type { PersonaCajaParam } from '@/lib/api/parametros';
import { conMiles, validarEnteroEnRango, validarNombrePersona, validarTextoLargo } from '@/lib/caja/validacion';
import { formatCurrency } from '@/lib/utils';

const VALOR_MIN = 1;
const VALOR_MAX = 99_999_999;
const MOTIVO_MIN = 3;
const MOTIVO_MAX = 200;
const MENSAJE_NO_GUARDADO = 'No se guardó. Intente de nuevo.';

type Signo = 'sumar' | 'quitar';

export interface DialogoAjusteMayorProps {
  /** Saldos de la caja mayor (Efectivo primero). */
  partes: ParteCajaMayor[];
  personas: PersonaCajaParam[];
  /** El ajuste quedó registrado: hay que recargar saldos y movimientos (Req 8.8). */
  onAjustado: () => void;
  /** El servidor rechazó por saldo: los saldos mostrados pueden estar desactualizados. */
  onRecargarSaldos?: () => void;
  onCerrar: () => void;
}

interface ErroresForm {
  parte?: string;
  valor?: string;
  motivo?: string;
  persona?: string;
}

interface AjusteValido {
  parteId: string;
  /** Con signo: positivo suma y negativo quita. */
  valor: number;
  motivo: string;
  persona: string;
}

/** Ajuste que falló sin conexión; "Reintentar" lo repite con la misma clave (Req 8.9). */
interface FalloConexion {
  ajuste: AjusteValido;
  clave: string;
}

function nombreParte(p: ParteCajaMayor): string {
  return p.metodoPagoId === null ? 'Efectivo' : p.nombre;
}

function mensajeValor(error: 'VACIO' | 'NO_ENTERO' | 'RANGO'): string {
  if (error === 'VACIO') return 'Escriba el valor del ajuste.';
  if (error === 'NO_ENTERO') return 'Escriba solo números enteros, sin comas ni decimales.';
  return `El valor debe estar entre ${formatCurrency(VALOR_MIN)} y ${formatCurrency(VALOR_MAX)}.`;
}

export function DialogoAjusteMayor({
  partes,
  personas,
  onAjustado,
  onRecargarSaldos,
  onCerrar,
}: DialogoAjusteMayorProps) {
  const { showToast } = useToast();
  const idValor = useId();
  const idMotivo = useId();
  const idTitulo = useId();

  // Partes inactivas sin saldo no se ofrecen (igual que en la sección).
  const disponibles = useMemo(() => partes.filter((p) => p.activo || p.saldo > 0), [partes]);

  const [parteId, setParteId] = useState('');
  const [signo, setSigno] = useState<Signo>('sumar');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [persona, setPersona] = useState('');
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [falloConexion, setFalloConexion] = useState<FalloConexion | null>(null);

  // La clave cambia solo si cambian los datos; un reintento del mismo ajuste la reutiliza (Req 8.9).
  const firma = JSON.stringify([parteId, signo, valor.trim(), motivo.trim(), persona.trim()]);
  const { clave } = useClaveIdempotente(firma);

  const elegida = disponibles.find((p) => p.parteId === parteId) ?? null;

  function validar(): AjusteValido | null {
    const nuevos: ErroresForm = {};
    if (!elegida) nuevos.parte = 'Escoja la parte que quiere ajustar.';
    const v = validarEnteroEnRango(valor, VALOR_MIN, VALOR_MAX);
    if (!v.ok) nuevos.valor = mensajeValor(v.error);
    const m = validarTextoLargo(motivo, MOTIVO_MIN, MOTIVO_MAX);
    if (!m.ok) {
      nuevos.motivo =
        m.error === 'CORTO'
          ? `Escriba el motivo (mínimo ${MOTIVO_MIN} caracteres).`
          : `Máximo ${MOTIVO_MAX} caracteres.`;
    }
    const p = validarNombrePersona(persona);
    if (!p.ok) nuevos.persona = p.error === 'VACIO' ? 'Escoja o escriba quién hace el ajuste.' : 'Máximo 60 caracteres.';

    setErrores(nuevos);
    if (!elegida || !v.ok || !m.ok || !p.ok) return null;
    return {
      parteId: elegida.parteId,
      valor: signo === 'sumar' ? v.valor : -v.valor,
      motivo: m.valor,
      persona: p.valor,
    };
  }

  async function enviar(ajuste: AjusteValido, claveUsada: string = clave) {
    setGuardando(true);
    setErrorGuardar(null);
    try {
      await ajustarCajaMayor({ clave: claveUsada, ...ajuste });
      setFalloConexion(null);
      showToast('Ajuste registrado', 'success');
      onAjustado();
      onCerrar();
    } catch (e) {
      const codigo = e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
      if (codigo === 'SIN_CONEXION') {
        setFalloConexion({ ajuste, clave: claveUsada });
      } else if (codigo === 'SALDO_INSUFICIENTE' && e instanceof ErrorApp) {
        const parte = parteDeError(e) ?? (elegida ? nombreParte(elegida) : null);
        setErrores((prev) => ({
          ...prev,
          valor: parte
            ? `No alcanza el saldo de ${parte} en caja mayor.`
            : 'No alcanza el saldo en caja mayor.',
        }));
        setFalloConexion(null);
        onRecargarSaldos?.();
      } else if (codigo === 'DATOS_INVALIDOS') {
        setErrorGuardar('Revise los datos e intente de nuevo.');
        setFalloConexion(null);
      } else {
        setErrorGuardar(MENSAJE_NO_GUARDADO);
        setFalloConexion(null);
      }
    } finally {
      setGuardando(false);
    }
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const ajuste = validar();
    if (ajuste) void enviar(ajuste);
  }

  function reintentar() {
    if (falloConexion) void enviar(falloConexion.ajuste, falloConexion.clave);
  }

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !guardando) onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [guardando, onCerrar]);

  const claseOpcion = (activa: boolean) =>
    `min-h-[48px] min-w-[44px] rounded-2xl border-2 px-4 text-base font-semibold transition-colors disabled:opacity-50 ${
      activa
        ? 'border-lz-sage bg-lz-sage text-lz-surface'
        : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
    }`;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-lz-charcoal/50 p-3 font-lz-sans text-lz-charcoal sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-lz-linen shadow-lz-float">
        <header className="flex items-center justify-between gap-3 border-b border-lz-border bg-lz-surface px-5 py-3">
          <h2 id={idTitulo} className="font-lz-display text-xl font-bold text-lz-charcoal">
            Ajuste manual
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-lz-charcoal-muted transition-colors hover:bg-lz-oat disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <form onSubmit={alEnviar} noValidate className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <p className="text-sm text-lz-charcoal-muted">
            Use el ajuste para corregir el saldo de una parte. Queda registrado con su motivo.
          </p>

          {falloConexion && <AvisoSinConexion onReintentar={reintentar} reintentando={guardando} />}

          <fieldset className="flex flex-col gap-2" disabled={guardando}>
            <legend className="mb-1 text-sm font-medium text-lz-charcoal-muted">Parte</legend>
            {disponibles.length === 0 ? (
              <p className="text-sm text-lz-charcoal-muted">No hay partes de caja mayor disponibles.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Parte de la caja mayor">
                {disponibles.map((p) => {
                  const activa = p.parteId === parteId;
                  return (
                    <button
                      key={p.parteId}
                      type="button"
                      aria-pressed={activa}
                      onClick={() => {
                        setParteId(p.parteId);
                        setErrores((prev) => (prev.parte ? { ...prev, parte: undefined } : prev));
                      }}
                      className={`flex min-h-[56px] min-w-[44px] flex-col items-start justify-center rounded-2xl border-2 px-4 py-2 text-left transition-colors disabled:opacity-50 ${
                        activa
                          ? 'border-lz-sage bg-lz-sage text-lz-surface'
                          : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
                      }`}
                    >
                      <span className="text-base font-semibold leading-tight">{nombreParte(p)}</span>
                      <span className={`text-xs tabular-nums ${activa ? 'text-lz-surface/90' : 'text-lz-charcoal-muted'}`}>
                        {formatCurrency(p.saldo)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {errores.parte && (
              <p role="alert" className="text-sm font-medium text-lz-danger">
                {errores.parte}
              </p>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2" disabled={guardando}>
            <legend className="mb-1 text-sm font-medium text-lz-charcoal-muted">Tipo de ajuste</legend>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sumar o quitar">
              <button type="button" aria-pressed={signo === 'sumar'} onClick={() => setSigno('sumar')} className={claseOpcion(signo === 'sumar')}>
                Sumar
              </button>
              <button type="button" aria-pressed={signo === 'quitar'} onClick={() => setSigno('quitar')} className={claseOpcion(signo === 'quitar')}>
                Quitar
              </button>
            </div>
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor={idValor} className="text-sm font-medium text-lz-charcoal-muted">
              Valor (COP)
            </label>
            <input
              id={idValor}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={valor}
              disabled={guardando}
              onChange={(e) => setValor(conMiles(e.target.value))}
              aria-invalid={errores.valor ? true : undefined}
              aria-describedby={errores.valor ? `${idValor}-error` : undefined}
              className={`min-h-[60px] w-full rounded-2xl border-2 bg-lz-surface px-4 font-lz-display text-3xl font-bold tabular-nums text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
                errores.valor ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
              }`}
            />
            {errores.valor && (
              <p id={`${idValor}-error`} role="alert" className="text-sm font-medium text-lz-danger">
                {errores.valor}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={idMotivo} className="text-sm font-medium text-lz-charcoal-muted">
              Motivo
            </label>
            <textarea
              id={idMotivo}
              value={motivo}
              rows={3}
              maxLength={MOTIVO_MAX + 20}
              disabled={guardando}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Corrección de un retiro mal escrito"
              aria-invalid={errores.motivo ? true : undefined}
              aria-describedby={errores.motivo ? `${idMotivo}-error` : undefined}
              className={`min-h-[96px] w-full rounded-2xl border-2 bg-lz-surface px-4 py-3 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
                errores.motivo ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
              }`}
            />
            {errores.motivo && (
              <p id={`${idMotivo}-error`} role="alert" className="text-sm font-medium text-lz-danger">
                {errores.motivo}
              </p>
            )}
          </div>

          <SelectorPersona
            personas={personas}
            value={persona}
            onChange={setPersona}
            error={errores.persona}
            etiqueta="¿Quién hace el ajuste?"
            disabled={guardando}
          />

          {errorGuardar && (
            <p
              role="alert"
              className="rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3 text-sm font-semibold text-lz-danger"
            >
              {errorGuardar}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="min-h-[56px] min-w-[44px] rounded-2xl border-2 border-lz-border px-5 text-base font-semibold text-lz-charcoal hover:bg-lz-sage-light disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="min-h-[56px] min-w-[44px] flex-1 rounded-2xl bg-lz-sage px-6 font-lz-display text-lg font-bold text-lz-surface shadow-lz-float transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Registrar ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DialogoAjusteMayor;
