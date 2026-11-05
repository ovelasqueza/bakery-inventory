'use client';

// Retiro de efectivo del cajón a la Caja mayor durante el turno (Req 5.1, 5.2, 5.3, 5.6, 5.7).
// La advertencia por superar el efectivo esperado no muestra cifras (cierre a ciegas).

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';
import { SelectorPersona } from '@/components/caja/SelectorPersona';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import { registrarRetiro } from '@/lib/api/cajaMayor';
import { ErrorApp } from '@/lib/api/errores';
import type { PersonaCajaParam } from '@/lib/api/parametros';
import { resumenTurno } from '@/lib/api/turnos';
import { requiereAdvertencia } from '@/lib/caja/turno';
import { validarEnteroEnRango, validarNombrePersona, validarTextoLargo } from '@/lib/caja/validacion';
import { formatCurrency } from '@/lib/utils';

const VALOR_MIN = 1;
const VALOR_MAX = 10_000_000;
const NOTA_MAX = 120;
const MENSAJE_NO_GUARDADO = 'No se guardó. Intente de nuevo.';

interface DialogoRetiroProps {
  turnoId: string;
  personas: PersonaCajaParam[];
  /** Se registró el retiro: el efectivo esperado cambió. */
  onRegistrado: () => void;
  /** El turno ya estaba cerrado: hay que mostrar la apertura (Req 5.6). */
  onTurnoCerrado: () => void;
  onCerrar: () => void;
}

interface ErroresForm {
  valor?: string;
  persona?: string;
  nota?: string;
}

interface RetiroValido {
  valor: number;
  persona: string;
  nota: string | null;
}

/** Retiro que falló sin conexión; "Reintentar" lo repite con la misma clave. */
interface FalloConexion {
  retiro: RetiroValido;
  confirmado: boolean;
  clave: string;
}

function codigoDe(e: unknown): string {
  return e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
}

function mensajeValor(error: 'VACIO' | 'NO_ENTERO' | 'RANGO'): string {
  if (error === 'VACIO') return 'Escriba el valor del retiro.';
  if (error === 'NO_ENTERO') return 'Escriba solo números enteros, sin puntos ni comas.';
  return `El valor debe estar entre ${formatCurrency(VALOR_MIN)} y ${formatCurrency(VALOR_MAX)}.`;
}

export function DialogoRetiro({ turnoId, personas, onRegistrado, onTurnoCerrado, onCerrar }: DialogoRetiroProps) {
  const { showToast } = useToast();
  const idValor = useId();
  const idNota = useId();
  const idTitulo = useId();

  const [valor, setValor] = useState('');
  const [persona, setPersona] = useState('');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [advertencia, setAdvertencia] = useState<RetiroValido | null>(null);
  const [falloConexion, setFalloConexion] = useState<FalloConexion | null>(null);

  // La clave cambia solo si cambian los datos; un reintento del mismo retiro la reutiliza (Req 5.7).
  const firma = JSON.stringify([turnoId, valor.trim(), persona.trim(), nota.trim()]);
  const { clave } = useClaveIdempotente(firma);

  const turnoCerrado = useCallback(() => {
    showToast('El turno ya fue cerrado', 'warning');
    onTurnoCerrado();
  }, [onTurnoCerrado, showToast]);

  function validar(): RetiroValido | null {
    const nuevos: ErroresForm = {};
    const v = validarEnteroEnRango(valor, VALOR_MIN, VALOR_MAX);
    if (!v.ok) nuevos.valor = mensajeValor(v.error);
    const p = validarNombrePersona(persona);
    if (!p.ok) nuevos.persona = p.error === 'VACIO' ? 'Escoja o escriba quién hace el retiro.' : 'Máximo 60 caracteres.';
    const n = validarTextoLargo(nota, 0, NOTA_MAX);
    if (!n.ok) nuevos.nota = `Máximo ${NOTA_MAX} caracteres.`;

    setErrores(nuevos);
    if (!v.ok || !p.ok || !n.ok) return null;
    return { valor: v.valor, persona: p.valor, nota: n.valor === '' ? null : n.valor };
  }

  /** Registra el retiro; si no está confirmado, antes lo compara con el efectivo esperado (Req 5.3). */
  async function enviar(retiro: RetiroValido, confirmado: boolean, claveUsada: string = clave) {
    setGuardando(true);
    setErrorGuardar(null);
    try {
      if (!confirmado) {
        const resumen = await resumenTurno(turnoId);
        if (requiereAdvertencia(retiro.valor, resumen.efectivoEsperado)) {
          setAdvertencia(retiro);
          setFalloConexion(null);
          return;
        }
      }
      await registrarRetiro({ clave: claveUsada, turnoId, ...retiro });
      setFalloConexion(null);
      showToast('Retiro registrado', 'success');
      onRegistrado();
      onCerrar();
    } catch (e) {
      const codigo = codigoDe(e);
      if (codigo === 'TURNO_CERRADO' || codigo === 'TURNO_NO_ABIERTO') turnoCerrado();
      else if (codigo === 'SIN_CONEXION') setFalloConexion({ retiro, confirmado, clave: claveUsada });
      else setErrorGuardar(MENSAJE_NO_GUARDADO);
    } finally {
      setGuardando(false);
    }
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const retiro = validar();
    if (retiro) void enviar(retiro, false);
  }

  function confirmarAdvertencia() {
    if (!advertencia) return;
    const retiro = advertencia;
    setAdvertencia(null);
    void enviar(retiro, true);
  }

  function reintentar() {
    if (falloConexion) void enviar(falloConexion.retiro, falloConexion.confirmado, falloConexion.clave);
  }

  // Esc cierra primero la advertencia y luego el diálogo.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || guardando) return;
      if (advertencia) setAdvertencia(null);
      else onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [advertencia, guardando, onCerrar]);

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
          <div className="flex min-w-0 flex-col">
            <h2 id={idTitulo} className="font-lz-display text-xl font-bold text-lz-charcoal">
              Retiros
            </h2>
            <p className="text-sm text-lz-charcoal-muted">El dinero sale del cajón hacia la caja mayor</p>
          </div>
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
            Saque el efectivo del cajón y regístrelo aquí para pasarlo a la caja mayor.
          </p>

          {falloConexion && <AvisoSinConexion onReintentar={reintentar} reintentando={guardando} />}

          <div className="flex flex-col gap-1">
            <label htmlFor={idValor} className="text-sm font-medium text-lz-charcoal-muted">
              Valor (COP)
            </label>
            <input
              id={idValor}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0"
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

          <SelectorPersona
            personas={personas}
            value={persona}
            onChange={setPersona}
            error={errores.persona}
            etiqueta="¿Quién hace el retiro?"
            disabled={guardando}
          />

          <div className="flex flex-col gap-1">
            <label htmlFor={idNota} className="text-sm font-medium text-lz-charcoal-muted">
              Nota (opcional)
            </label>
            <input
              id={idNota}
              type="text"
              autoComplete="off"
              value={nota}
              maxLength={NOTA_MAX + 20}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: Retiro de mediodía"
              aria-invalid={errores.nota ? true : undefined}
              aria-describedby={errores.nota ? `${idNota}-error` : undefined}
              className={`min-h-[48px] w-full rounded-2xl border-2 bg-lz-surface px-4 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
                errores.nota ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
              }`}
            />
            {errores.nota && (
              <p id={`${idNota}-error`} role="alert" className="text-sm font-medium text-lz-danger">
                {errores.nota}
              </p>
            )}
          </div>

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
              {guardando ? 'Guardando…' : 'Registrar retiro'}
            </button>
          </div>
        </form>
      </div>

      {/* Advertencia sin cifras: el retiro supera el efectivo esperado del cajón (Req 5.3) */}
      {advertencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="El retiro supera el efectivo del cajón"
            className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-lz-surface p-6 shadow-lz-float"
          >
            <h3 className="font-lz-display text-xl font-bold text-lz-charcoal">
              El retiro supera el efectivo que debería haber en el cajón
            </h3>
            <p className="rounded-2xl bg-lz-amber-light px-4 py-3 text-base text-lz-charcoal">
              Revise el valor escrito. ¿Desea registrarlo de todas formas?
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setAdvertencia(null)}
                className="min-h-[48px] min-w-[44px] rounded-2xl border-2 border-lz-border px-5 text-base font-semibold text-lz-charcoal hover:bg-lz-sage-light"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAdvertencia}
                className="min-h-[48px] min-w-[44px] rounded-2xl bg-lz-amber px-5 text-base font-bold text-lz-surface hover:bg-lz-amber-warm"
              >
                Registrar igual
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DialogoRetiro;
