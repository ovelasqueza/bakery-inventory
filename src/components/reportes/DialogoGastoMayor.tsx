'use client';

// Gasto o pago grande desde la caja mayor, sin turno (Req 8.6, 8.7): sale solo de Partes, nunca del Cajón.

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';
import { SelectorOrigenGasto } from '@/components/caja/SelectorOrigenGasto';
import { SelectorPersona } from '@/components/caja/SelectorPersona';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import type { ParteCajaMayor } from '@/lib/api/cajaMayor';
import { ErrorApp, parteDeError } from '@/lib/api/errores';
import { registrarGasto, type OrigenGasto } from '@/lib/api/gastos';
import type { CategoriaGastoParam, PersonaCajaParam } from '@/lib/api/parametros';
import { validarOrigenes, type ErrorOrigen } from '@/lib/caja/cajaMayor';
import { validarEnteroEnRango, validarNombrePersona, validarTextoLargo } from '@/lib/caja/validacion';
import { formatCurrency } from '@/lib/utils';

const VALOR_MIN = 1;
const VALOR_MAX = 10_000_000;
const CONCEPTO_MAX = 120;
const MENSAJE_NO_GUARDADO = 'No se guardó. Intente de nuevo.';
const MENSAJE_ORIGEN_INVALIDO = 'Revise de dónde sale el dinero: los valores deben sumar el total.';

export interface DialogoGastoMayorProps {
  /** Saldos de la caja mayor (Efectivo primero). */
  partes: ParteCajaMayor[];
  /** Categorías de gasto; solo se ofrecen las activas. */
  categorias: CategoriaGastoParam[];
  personas: PersonaCajaParam[];
  /** El gasto quedó registrado: hay que recargar saldos y movimientos (Req 8.8). */
  onRegistrado: () => void;
  /** El servidor rechazó por saldo u origen: los saldos mostrados pueden estar desactualizados. */
  onRecargarSaldos?: () => void;
  onCerrar: () => void;
}

interface ErroresForm {
  valor?: string;
  concepto?: string;
  categoria?: string;
  persona?: string;
  origen?: string;
}

interface GastoValido {
  valor: number;
  concepto: string;
  categoriaId: string;
  persona: string;
  origenes: OrigenGasto[];
}

/** Gasto que falló sin conexión; "Reintentar" lo repite con la misma clave. */
interface FalloConexion {
  gasto: GastoValido;
  clave: string;
}

function mensajeValor(error: 'VACIO' | 'NO_ENTERO' | 'RANGO'): string {
  if (error === 'VACIO') return 'Escriba el valor del gasto.';
  if (error === 'NO_ENTERO') return 'Escriba solo números enteros, sin puntos ni comas.';
  return `El valor debe estar entre ${formatCurrency(VALOR_MIN)} y ${formatCurrency(VALOR_MAX)}.`;
}

function mensajeOrigen(error: ErrorOrigen): string {
  if (error === 'SUMA_DISTINTA') return 'Los valores de cada fuente deben sumar el valor del gasto.';
  if (error === 'VALOR_INVALIDO') return 'Escriba en cada fuente un número entero mayor que 0, o déjela vacía.';
  if (error === 'VACIO') return 'Escoja de qué parte de la caja mayor sale el dinero.';
  return 'Escoja otra vez de dónde sale el dinero.';
}

export function DialogoGastoMayor({
  partes,
  categorias,
  personas,
  onRegistrado,
  onRecargarSaldos,
  onCerrar,
}: DialogoGastoMayorProps) {
  const { showToast } = useToast();
  const idValor = useId();
  const idConcepto = useId();
  const idTitulo = useId();

  const [valor, setValor] = useState('');
  const [concepto, setConcepto] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [persona, setPersona] = useState('');
  const [origenes, setOrigenes] = useState<OrigenGasto[]>([]);
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [falloConexion, setFalloConexion] = useState<FalloConexion | null>(null);

  const activas = categorias.filter((c) => c.activo);
  const valorNumerico = useMemo(() => {
    const v = validarEnteroEnRango(valor, VALOR_MIN, VALOR_MAX);
    return v.ok ? v.valor : null;
  }, [valor]);

  // La clave cambia solo si cambian los datos; un reintento del mismo gasto la reutiliza.
  const firma = JSON.stringify([valor.trim(), concepto.trim(), categoriaId, persona.trim(), origenes]);
  const { clave } = useClaveIdempotente(firma);

  function validar(): GastoValido | null {
    const nuevos: ErroresForm = {};
    const v = validarEnteroEnRango(valor, VALOR_MIN, VALOR_MAX);
    if (!v.ok) nuevos.valor = mensajeValor(v.error);
    const c = validarTextoLargo(concepto, 1, CONCEPTO_MAX);
    if (!c.ok) {
      nuevos.concepto = c.error === 'CORTO' ? 'Escriba el concepto.' : `Máximo ${CONCEPTO_MAX} caracteres.`;
    }
    if (!activas.some((cat) => cat.id === categoriaId)) nuevos.categoria = 'Escoja una categoría.';
    const p = validarNombrePersona(persona);
    if (!p.ok) nuevos.persona = p.error === 'VACIO' ? 'Escoja o escriba quién registra.' : 'Máximo 60 caracteres.';
    let origenValido = false;
    if (v.ok) {
      // Sin turno no hay Cajón (Req 8.7).
      const o = validarOrigenes(v.valor, origenes, {
        conTurno: false,
        partes: new Set(partes.map((x) => x.parteId)),
      });
      if (o.ok) origenValido = true;
      else nuevos.origen = mensajeOrigen(o.error);
    }

    setErrores(nuevos);
    if (!v.ok || !c.ok || !p.ok || nuevos.categoria || !origenValido) return null;
    return { valor: v.valor, concepto: c.valor, categoriaId, persona: p.valor, origenes };
  }

  async function enviar(gasto: GastoValido, claveUsada: string = clave) {
    setGuardando(true);
    setErrorGuardar(null);
    try {
      await registrarGasto({ clave: claveUsada, turnoId: null, ...gasto });
      setFalloConexion(null);
      showToast('Gasto registrado', 'success');
      onRegistrado();
      onCerrar();
    } catch (e) {
      const codigo = e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
      if (codigo === 'SIN_CONEXION') {
        setFalloConexion({ gasto, clave: claveUsada });
        return;
      }
      setFalloConexion(null);
      if (codigo === 'SALDO_INSUFICIENTE' && e instanceof ErrorApp) {
        const parte = parteDeError(e);
        setErrores((prev) => ({
          ...prev,
          origen: parte ? `No alcanza el saldo de ${parte} en caja mayor.` : 'No alcanza el saldo en caja mayor.',
        }));
        onRecargarSaldos?.();
      } else if (codigo === 'ORIGEN_INVALIDO') {
        setErrores((prev) => ({ ...prev, origen: MENSAJE_ORIGEN_INVALIDO }));
        onRecargarSaldos?.();
      } else if (codigo === 'DATOS_INVALIDOS') {
        setErrorGuardar('Revise los datos e intente de nuevo.');
      } else {
        setErrorGuardar(MENSAJE_NO_GUARDADO);
      }
    } finally {
      setGuardando(false);
    }
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const gasto = validar();
    if (gasto) void enviar(gasto);
  }

  function reintentar() {
    if (falloConexion) void enviar(falloConexion.gasto, falloConexion.clave);
  }

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !guardando) onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [guardando, onCerrar]);

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
      <div className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-lz-linen shadow-lz-float">
        <header className="flex items-center justify-between gap-3 border-b border-lz-border bg-lz-surface px-5 py-3">
          <h2 id={idTitulo} className="font-lz-display text-xl font-bold text-lz-charcoal">
            Gasto o pago grande
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
            El dinero sale de la caja mayor, no del cajón. No queda ligado a ningún turno.
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
              value={valor}
              disabled={guardando}
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

          <div className="flex flex-col gap-1">
            <label htmlFor={idConcepto} className="text-sm font-medium text-lz-charcoal-muted">
              Concepto
            </label>
            <input
              id={idConcepto}
              type="text"
              autoComplete="off"
              value={concepto}
              maxLength={CONCEPTO_MAX + 20}
              disabled={guardando}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej: Bulto de harina, arriendo"
              aria-invalid={errores.concepto ? true : undefined}
              aria-describedby={errores.concepto ? `${idConcepto}-error` : undefined}
              className={`min-h-[48px] w-full rounded-2xl border-2 bg-lz-surface px-4 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
                errores.concepto ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
              }`}
            />
            {errores.concepto && (
              <p id={`${idConcepto}-error`} role="alert" className="text-sm font-medium text-lz-danger">
                {errores.concepto}
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-2" disabled={guardando}>
            <legend className="mb-1 text-sm font-medium text-lz-charcoal-muted">Categoría</legend>
            {activas.length === 0 ? (
              <p className="text-sm text-lz-charcoal-muted">No hay categorías de gasto activas.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Categorías de gasto">
                {activas.map((c) => {
                  const elegida = c.id === categoriaId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={elegida}
                      onClick={() => setCategoriaId(c.id)}
                      className={`min-h-[48px] min-w-[44px] rounded-2xl border-2 px-4 text-base font-semibold transition-colors disabled:opacity-50 ${
                        elegida
                          ? 'border-lz-sage bg-lz-sage text-lz-surface'
                          : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
                      }`}
                    >
                      {c.nombre}
                    </button>
                  );
                })}
              </div>
            )}
            {errores.categoria && (
              <p role="alert" className="text-sm font-medium text-lz-danger">
                {errores.categoria}
              </p>
            )}
          </fieldset>

          <SelectorOrigenGasto
            valor={valorNumerico}
            partes={partes}
            permitirCajon={false}
            value={origenes}
            onChange={(o) => {
              setOrigenes(o);
              setErrores((prev) => (prev.origen ? { ...prev, origen: undefined } : prev));
            }}
            error={errores.origen}
            deshabilitado={guardando}
          />

          <SelectorPersona
            personas={personas}
            value={persona}
            onChange={setPersona}
            error={errores.persona}
            etiqueta="¿Quién registra el gasto?"
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
              {guardando ? 'Guardando…' : 'Registrar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DialogoGastoMayor;
