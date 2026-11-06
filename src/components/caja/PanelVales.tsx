'use client';

// Registro y consulta de Vales de empleados en el turno abierto.
// Permite elegir de forma sencilla si el vale es por Producto/Consumo (no afecta el efectivo
// del cajón) o si se saca Dinero de la caja (se resta del efectivo esperado del turno para
// no descuadrar el cierre).

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';
import { SelectorPersona } from '@/components/caja/SelectorPersona';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import { ErrorApp } from '@/lib/api/errores';
import type { PersonaCajaParam } from '@/lib/api/parametros';
import { resumenTurno } from '@/lib/api/turnos';
import { eliminarVale, registrarVale, valesDelTurno, type Vale } from '@/lib/api/vales';
import { requiereAdvertencia } from '@/lib/caja/turno';
import { conMiles, validarEnteroEnRango, validarNombrePersona, validarTextoLargo } from '@/lib/caja/validacion';
import { hora12 } from '@/lib/fechas/bogota';
import { formatCurrency } from '@/lib/utils';

const VALOR_MIN = 1;
const VALOR_MAX = 10_000_000;
const DESCRIPCION_MIN = 2;
const DESCRIPCION_MAX = 120;
const MENSAJE_NO_GUARDADO = 'No se guardó. Intente de nuevo.';

interface PanelValesProps {
  turnoId: string;
  personas: PersonaCajaParam[];
  onCambio: () => void;
  onTurnoCerrado: () => void;
  onCerrar: () => void;
}

interface ErroresForm {
  valor?: string;
  descripcion?: string;
  empleado?: string;
}

interface ValeValido {
  valor: number;
  descripcion: string;
  empleado: string;
  saleDeCaja: boolean;
}

interface FalloConexion {
  vale: ValeValido;
  confirmado: boolean;
  clave: string;
}

function codigoDe(e: unknown): string {
  return e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
}

function mensajeValor(error: 'VACIO' | 'NO_ENTERO' | 'RANGO'): string {
  if (error === 'VACIO') return 'Escriba el monto del vale.';
  if (error === 'NO_ENTERO') return 'Escriba solo números enteros, sin comas ni decimales.';
  return `El monto debe estar entre ${formatCurrency(VALOR_MIN)} y ${formatCurrency(VALOR_MAX)}.`;
}

function mensajeDescripcion(error: 'CORTO' | 'LARGO'): string {
  if (error === 'CORTO') return `Escriba la descripción (mínimo ${DESCRIPCION_MIN} caracteres).`;
  return `Máximo ${DESCRIPCION_MAX} caracteres.`;
}

export function PanelVales({ turnoId, personas, onCambio, onTurnoCerrado, onCerrar }: PanelValesProps) {
  const { showToast } = useToast();
  const idValor = useId();
  const idDescripcion = useId();
  const idTitulo = useId();

  const [vales, setVales] = useState<Vale[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<ErrorApp | null>(null);

  const [saleDeCaja, setSaleDeCaja] = useState(false);
  const [valor, setValor] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [empleado, setEmpleado] = useState('');
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [advertencia, setAdvertencia] = useState<ValeValido | null>(null);
  const [porEliminar, setPorEliminar] = useState<Vale | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<ErrorApp | null>(null);
  const [falloConexion, setFalloConexion] = useState<FalloConexion | null>(null);

  const firma = JSON.stringify([turnoId, saleDeCaja, valor.trim(), descripcion.trim(), empleado.trim()]);
  const { clave, renovar } = useClaveIdempotente(firma);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setVales(await valesDelTurno(turnoId));
    } catch (e) {
      setErrorCarga(e instanceof ErrorApp ? e : new ErrorApp('DESCONOCIDO', e));
    } finally {
      setCargando(false);
    }
  }, [turnoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totalValesTurno = useMemo(() => vales.reduce((s, v) => s + v.valor, 0), [vales]);
  const totalDineroCaja = useMemo(
    () => vales.reduce((s, v) => (v.saleDeCaja ? s + v.valor : s), 0),
    [vales]
  );

  const turnoCerrado = useCallback(() => {
    showToast('El turno ya fue cerrado', 'warning');
    onTurnoCerrado();
  }, [onTurnoCerrado, showToast]);

  function limpiarFormulario() {
    setValor('');
    setDescripcion('');
    setErrores({});
    setErrorGuardar(null);
    setFalloConexion(null);
    renovar();
  }

  function validar(): ValeValido | null {
    const nuevos: ErroresForm = {};
    const v = validarEnteroEnRango(valor, VALOR_MIN, VALOR_MAX);
    if (!v.ok) nuevos.valor = mensajeValor(v.error);
    const d = validarTextoLargo(descripcion, DESCRIPCION_MIN, DESCRIPCION_MAX);
    if (!d.ok) nuevos.descripcion = mensajeDescripcion(d.error);
    const p = validarNombrePersona(empleado);
    if (!p.ok) {
      nuevos.empleado = p.error === 'VACIO' ? 'Escoja o escriba quién saca el vale.' : 'Máximo 60 caracteres.';
    }

    setErrores(nuevos);
    if (!v.ok || !d.ok || !p.ok) return null;
    return {
      valor: v.valor,
      descripcion: d.valor,
      empleado: p.valor,
      saleDeCaja,
    };
  }

  async function enviar(vale: ValeValido, confirmado: boolean, claveUsada: string = clave) {
    setGuardando(true);
    setErrorGuardar(null);
    try {
      if (vale.saleDeCaja && !confirmado) {
        const resumen = await resumenTurno(turnoId);
        if (requiereAdvertencia(vale.valor, resumen.efectivoEsperado)) {
          setAdvertencia(vale);
          setFalloConexion(null);
          return;
        }
      }
      await registrarVale({ clave: claveUsada, turnoId, ...vale });
      limpiarFormulario();
      showToast(
        vale.saleDeCaja ? 'Vale registrado (se restó del efectivo de la caja)' : 'Vale de producto registrado',
        'success'
      );
      onCambio();
      await cargar();
    } catch (e) {
      const codigo = codigoDe(e);
      if (codigo === 'TURNO_CERRADO' || codigo === 'TURNO_NO_ABIERTO') turnoCerrado();
      else if (codigo === 'SIN_CONEXION') setFalloConexion({ vale, confirmado, clave: claveUsada });
      else setErrorGuardar(MENSAJE_NO_GUARDADO);
    } finally {
      setGuardando(false);
    }
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const vale = validar();
    if (vale) void enviar(vale, false);
  }

  function confirmarAdvertencia() {
    if (!advertencia) return;
    const vale = advertencia;
    setAdvertencia(null);
    void enviar(vale, true);
  }

  function reintentarGuardar() {
    if (falloConexion) void enviar(falloConexion.vale, falloConexion.confirmado, falloConexion.clave);
  }

  async function confirmarEliminar() {
    if (!porEliminar || eliminando) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await eliminarVale(porEliminar.id);
      setPorEliminar(null);
      showToast('Vale eliminado', 'success');
      onCambio();
      await cargar();
    } catch (e) {
      const err = e instanceof ErrorApp ? e : new ErrorApp('DESCONOCIDO', e);
      if (err.codigo === 'TURNO_CERRADO') {
        setPorEliminar(null);
        turnoCerrado();
      } else {
        setErrorEliminar(err);
      }
    } finally {
      setEliminando(false);
    }
  }

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || guardando || eliminando) return;
      if (advertencia) setAdvertencia(null);
      else if (porEliminar) {
        setPorEliminar(null);
        setErrorEliminar(null);
      } else {
        onCerrar();
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [advertencia, eliminando, guardando, onCerrar, porEliminar]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-lz-charcoal/50 p-3 font-lz-sans text-lz-charcoal sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando && !eliminando) onCerrar();
      }}
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-lz-linen shadow-lz-float">
        <header className="flex items-center justify-between gap-3 border-b border-lz-border bg-lz-surface px-5 py-3">
          <div className="flex min-w-0 flex-col">
            <h2 id={idTitulo} className="font-lz-display text-xl font-bold text-lz-charcoal">
              Vales de empleados
            </h2>
            <p className="text-sm text-lz-charcoal-muted">
              Registre productos llevados o dinero sacado de la caja para descontar en el pago
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando || eliminando}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-lz-charcoal-muted transition-colors hover:bg-lz-oat disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          <form onSubmit={alEnviar} noValidate className="flex flex-col gap-4 rounded-2xl border border-lz-border bg-lz-surface p-4">
            <h3 className="font-lz-display text-base font-bold text-lz-charcoal">Registrar vale</h3>

            {falloConexion && <AvisoSinConexion onReintentar={reintentarGuardar} reintentando={guardando} />}

            {/* Selector intuitivo: ¿Sale dinero de la caja o es producto? */}
            <fieldset disabled={guardando} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-lz-charcoal-muted">
                ¿Sale dinero en efectivo de la caja?
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={!saleDeCaja}
                  onClick={() => setSaleDeCaja(false)}
                  className={`flex min-h-[60px] flex-col items-start justify-center rounded-2xl border-2 px-4 py-2.5 text-left transition-colors ${
                    !saleDeCaja
                      ? 'border-lz-sage bg-lz-sage-light text-lz-charcoal'
                      : 'border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-oat'
                  }`}
                >
                  <span className="flex items-center gap-2 text-base font-bold">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${
                        !saleDeCaja ? 'bg-lz-sage' : 'border border-lz-charcoal-muted'
                      }`}
                    />
                    No · Lleva producto
                  </span>
                  <span className="mt-0.5 text-xs text-lz-charcoal-muted">
                    No saca billetes del cajón (no afecta el cuadre)
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={saleDeCaja}
                  onClick={() => setSaleDeCaja(true)}
                  className={`flex min-h-[60px] flex-col items-start justify-center rounded-2xl border-2 px-4 py-2.5 text-left transition-colors ${
                    saleDeCaja
                      ? 'border-lz-amber bg-lz-amber-light text-lz-charcoal'
                      : 'border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-oat'
                  }`}
                >
                  <span className="flex items-center gap-2 text-base font-bold">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${
                        saleDeCaja ? 'bg-lz-amber' : 'border border-lz-charcoal-muted'
                      }`}
                    />
                    Sí · Saca dinero de caja
                  </span>
                  <span className="mt-0.5 text-xs text-lz-charcoal-muted">
                    Se resta del efectivo del turno para cuadrar caja
                  </span>
                </button>
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor={idValor} className="text-sm font-medium text-lz-charcoal-muted">
                  Monto del vale (COP)
                </label>
                <input
                  id={idValor}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={valor}
                  onChange={(e) => setValor(conMiles(e.target.value))}
                  placeholder="Ej: 15.000"
                  aria-invalid={errores.valor ? true : undefined}
                  aria-describedby={errores.valor ? `${idValor}-error` : undefined}
                  className={`min-h-[56px] w-full rounded-2xl border-2 bg-lz-surface px-4 font-lz-display text-2xl font-bold tabular-nums text-lz-charcoal placeholder:text-base placeholder:font-normal placeholder:text-lz-charcoal-muted focus:outline-none ${
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
                <label htmlFor={idDescripcion} className="text-sm font-medium text-lz-charcoal-muted">
                  Descripción ({saleDeCaja ? 'motivo del vale' : 'qué productos lleva'})
                </label>
                <input
                  id={idDescripcion}
                  type="text"
                  autoComplete="off"
                  value={descripcion}
                  maxLength={DESCRIPCION_MAX + 20}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder={saleDeCaja ? 'Ej: Adelanto en efectivo' : 'Ej: 2 pasteles y 1 gaseosa'}
                  aria-invalid={errores.descripcion ? true : undefined}
                  aria-describedby={errores.descripcion ? `${idDescripcion}-error` : undefined}
                  className={`min-h-[56px] w-full rounded-2xl border-2 bg-lz-surface px-4 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
                    errores.descripcion ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
                  }`}
                />
                {errores.descripcion && (
                  <p id={`${idDescripcion}-error`} role="alert" className="text-sm font-medium text-lz-danger">
                    {errores.descripcion}
                  </p>
                )}
              </div>
            </div>

            <SelectorPersona
              personas={personas}
              value={empleado}
              onChange={setEmpleado}
              error={errores.empleado}
              etiqueta="¿Quién saca el vale?"
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

            <button
              type="submit"
              disabled={guardando}
              className="min-h-[56px] w-full rounded-2xl bg-lz-sage px-6 font-lz-display text-lg font-bold text-lz-surface shadow-lz-float transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
            >
              {guardando
                ? 'Guardando…'
                : saleDeCaja
                  ? 'Registrar vale (sale dinero de caja)'
                  : 'Registrar vale de producto'}
            </button>
          </form>

          <section aria-label="Vales del turno" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col">
                <h3 className="font-lz-display text-base font-bold text-lz-charcoal">Vales de este turno</h3>
                {totalDineroCaja > 0 && (
                  <span className="text-xs font-medium text-lz-charcoal-muted">
                    Sacado del cajón en vales: {formatCurrency(totalDineroCaja)}
                  </span>
                )}
              </div>
              <span className="font-lz-display text-base font-bold tabular-nums text-lz-charcoal">
                Total vales: {formatCurrency(totalValesTurno)}
              </span>
            </div>

            {cargando ? (
              <p className="py-6 text-center text-sm text-lz-charcoal-muted">Cargando vales…</p>
            ) : errorCarga ? (
              errorCarga.codigo === 'SIN_CONEXION' ? (
                <AvisoSinConexion onReintentar={() => void cargar()} />
              ) : (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface p-4"
                >
                  <p className="text-sm font-semibold text-lz-danger">No se pudieron cargar los vales.</p>
                  <button
                    type="button"
                    onClick={() => void cargar()}
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface hover:bg-lz-sage-dark"
                  >
                    Reintentar
                  </button>
                </div>
              )
            ) : vales.length === 0 ? (
              <p className="rounded-2xl border border-lz-border bg-lz-surface px-4 py-6 text-center text-sm text-lz-charcoal-muted">
                No hay vales registrados en este turno.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {vales.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lz-border bg-lz-surface px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-lz-charcoal-muted">
                        <span className="font-semibold tabular-nums text-lz-charcoal">{hora12(v.creadoEn)}</span>
                        <span>·</span>
                        <span className="font-bold text-lz-charcoal">{v.empleado}</span>
                        <span>·</span>
                        <span
                          className={`rounded-lg px-2 py-0.5 font-semibold ${
                            v.saleDeCaja
                              ? 'bg-lz-amber-light text-lz-charcoal'
                              : 'bg-lz-sage-light text-lz-sage-dark'
                          }`}
                        >
                          {v.saleDeCaja ? 'Dinero de caja' : 'Producto / Consumo'}
                        </span>
                      </div>
                      <p className=" break-words text-base font-semibold text-lz-charcoal">{v.descripcion}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-lz-display text-lg font-bold tabular-nums text-lz-charcoal">
                        {formatCurrency(v.valor)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorEliminar(null);
                          setPorEliminar(v);
                        }}
                        aria-label={`Eliminar vale de ${v.empleado}`}
                        className="min-h-[44px] min-w-[44px] rounded-xl border border-lz-danger-border px-3 text-sm font-semibold text-lz-danger transition-colors hover:bg-lz-danger-surface"
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Advertencia cuando el vale en efectivo supera lo esperado en el cajón */}
      {advertencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="El vale en efectivo supera el dinero esperado en el cajón"
            className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-lz-surface p-6 shadow-lz-float"
          >
            <h3 className="font-lz-display text-xl font-bold text-lz-charcoal">
              El monto supera el efectivo esperado en el cajón
            </h3>
            <p className="rounded-2xl bg-lz-amber-light px-4 py-3 text-base text-lz-charcoal">
              Revise el valor escrito. ¿Desea registrar el vale de todas formas?
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

      {/* Confirmación para eliminar vale */}
      {porEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirmar eliminación del vale"
            className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-lz-surface p-6 shadow-lz-float"
          >
            <h3 className="font-lz-display text-xl font-bold text-lz-charcoal">¿Eliminar este vale?</h3>
            <p className="text-base text-lz-charcoal">
              <span className="font-semibold">{porEliminar.empleado}</span> · {porEliminar.descripcion} —{' '}
              <span className="font-lz-display font-bold tabular-nums">{formatCurrency(porEliminar.valor)}</span>
            </p>
            {errorEliminar &&
              (errorEliminar.codigo === 'SIN_CONEXION' ? (
                <AvisoSinConexion onReintentar={() => void confirmarEliminar()} reintentando={eliminando} />
              ) : (
                <p
                  role="alert"
                  className="rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3 text-sm font-semibold text-lz-danger"
                >
                  {MENSAJE_NO_GUARDADO}
                </p>
              ))}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={eliminando}
                onClick={() => {
                  setPorEliminar(null);
                  setErrorEliminar(null);
                }}
                className="min-h-[48px] min-w-[44px] rounded-2xl border-2 border-lz-border px-5 text-base font-semibold text-lz-charcoal hover:bg-lz-sage-light disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={eliminando}
                onClick={() => void confirmarEliminar()}
                className="min-h-[48px] min-w-[44px] rounded-2xl bg-lz-danger px-5 text-base font-bold text-lz-surface hover:opacity-90 disabled:opacity-50"
              >
                {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelVales;
