'use client';

// Crear, cambiar o quitar el PIN_Admin de Reportes (Req 15.4, 15.9, 14.10, 14.12).
// El PIN se envía solo a la función RPC; nunca se guarda en el navegador.

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { cambiarPin, pinConfigurado } from '@/lib/api/pin';
import { ErrorApp } from '@/lib/api/errores';
import { validarPinNuevo } from '@/lib/seguridad/pin';
import { useGuardaPin } from '@/components/reportes/GuardaPin';

type Modo = 'cambiar' | 'quitar';
type Campo = 'actual' | 'nuevo' | 'confirmar';

const MSJ_PIN_INVALIDO = 'El PIN debe tener de 4 a 8 dígitos';
const MSJ_PIN_INCORRECTO = 'El PIN actual no es correcto';
const MSJ_NO_COINCIDE = 'La confirmación no coincide con el PIN nuevo';
const MSJ_FALTA_ACTUAL = 'Escriba el PIN actual';

function mensajeServidor(error: unknown): { campo: Campo | null; texto: string } {
  if (error instanceof ErrorApp) {
    if (error.codigo === 'PIN_INCORRECTO') return { campo: 'actual', texto: MSJ_PIN_INCORRECTO };
    if (error.codigo === 'PIN_INVALIDO') return { campo: 'nuevo', texto: MSJ_PIN_INVALIDO };
    if (error.codigo === 'SIN_CONEXION') {
      return { campo: null, texto: 'Sin conexión. Revise el internet y vuelva a intentar.' };
    }
  }
  return { campo: null, texto: 'No se pudo guardar el PIN. Intente de nuevo.' };
}

export function ConfigPin() {
  const { showToast } = useToast();
  const { refrescarPin } = useGuardaPin();
  const idTitulo = useId();

  const [hayPin, setHayPin] = useState<boolean | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [modo, setModo] = useState<Modo>('cambiar');
  const [actual, setActual] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setErrorCarga(false);
    setHayPin(null);
    try {
      setHayPin(await pinConfigurado());
    } catch {
      setErrorCarga(true);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function limpiar() {
    setActual('');
    setNuevo('');
    setConfirmar('');
    setErrores({});
    setErrorGeneral(null);
  }

  function cambiarModo(m: Modo) {
    setModo(m);
    limpiar();
  }

  /** Sincroniza GuardaPin; si falla, el cambio ya quedó guardado y solo se ignora. */
  async function sincronizar(marcarVerificado: boolean) {
    try {
      await refrescarPin(marcarVerificado ? { marcarVerificado: true } : undefined);
    } catch {
      // GuardaPin conserva su estado; la siguiente carga de Reportes lo corrige.
    }
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardando || hayPin === null) return;

    const quitar = hayPin && modo === 'quitar';
    const pideActual = hayPin;
    const errs: Partial<Record<Campo, string>> = {};

    if (pideActual && actual.length === 0) errs.actual = MSJ_FALTA_ACTUAL;
    if (!quitar) {
      if (!validarPinNuevo(nuevo)) errs.nuevo = MSJ_PIN_INVALIDO;
      else if (confirmar !== nuevo) errs.confirmar = MSJ_NO_COINCIDE;
    }
    setErrorGeneral(null);
    if (Object.keys(errs).length > 0) {
      // Req 15.9: no se llama al servidor y el PIN guardado sigue igual.
      setErrores(errs);
      return;
    }
    setErrores({});

    setGuardando(true);
    try {
      await cambiarPin(pideActual ? actual : null, quitar ? null : nuevo);
      limpiar();
      setModo('cambiar');
      if (quitar) {
        setHayPin(false);
        showToast('PIN quitado', 'success');
        await sincronizar(false);
      } else {
        setHayPin(true);
        showToast(hayPin ? 'PIN cambiado' : 'PIN creado', 'success');
        await sincronizar(true);
      }
    } catch (err) {
      // Req 14.12: se conservan los valores escritos para reintentar.
      const m = mensajeServidor(err);
      if (m.campo) setErrores({ [m.campo]: m.texto });
      else setErrorGeneral(m.texto);
    } finally {
      setGuardando(false);
    }
  }

  const titulo = hayPin ? (modo === 'quitar' ? 'Quitar PIN' : 'Cambiar PIN') : 'Crear PIN';

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-3 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft"
    >
      <div className="flex flex-col gap-1">
        <h3 id={idTitulo} className="font-lz-display text-lg font-bold text-lz-charcoal">
          PIN de Reportes
        </h3>
        <p className="text-sm text-lz-charcoal-muted">
          El PIN solo oculta Reportes a quien atiende la Caja. No es una seguridad completa: no protege los
          datos frente a alguien con acceso técnico a la aplicación.
        </p>
      </div>

      {errorCarga ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-3"
        >
          <p className="text-sm font-medium text-lz-danger">No se pudo saber si hay un PIN configurado.</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="min-h-[44px] self-start rounded-2xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark"
          >
            Reintentar
          </button>
        </div>
      ) : hayPin === null ? (
        <p role="status" className="text-sm text-lz-charcoal-muted">
          Cargando…
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-lz-charcoal">
            {hayPin ? 'Hay un PIN configurado.' : 'No hay PIN configurado. Reportes se abre sin pedir PIN.'}
          </p>

          {hayPin && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Acción sobre el PIN">
              {(['cambiar', 'quitar'] as const).map((m) => {
                const activo = modo === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => cambiarModo(m)}
                    disabled={guardando}
                    className={`min-h-[44px] min-w-[44px] rounded-2xl border-2 px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
                      activo
                        ? 'border-lz-sage bg-lz-sage text-lz-surface'
                        : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
                    }`}
                  >
                    {m === 'cambiar' ? 'Cambiar PIN' : 'Quitar PIN'}
                  </button>
                );
              })}
            </div>
          )}

          <form onSubmit={enviar} noValidate className="flex flex-col gap-3" aria-label={titulo}>
            {hayPin && (
              <CampoPin
                etiqueta="PIN actual"
                valor={actual}
                onCambio={(v) => {
                  setActual(v);
                  setErrores((e) => ({ ...e, actual: undefined }));
                }}
                error={errores.actual}
                deshabilitado={guardando}
              />
            )}
            {!(hayPin && modo === 'quitar') && (
              <>
                <CampoPin
                  etiqueta="PIN nuevo (4 a 8 dígitos)"
                  valor={nuevo}
                  onCambio={(v) => {
                    setNuevo(v);
                    setErrores((e) => ({ ...e, nuevo: undefined }));
                  }}
                  error={errores.nuevo}
                  deshabilitado={guardando}
                />
                <CampoPin
                  etiqueta="Confirmar PIN nuevo"
                  valor={confirmar}
                  onCambio={(v) => {
                    setConfirmar(v);
                    setErrores((e) => ({ ...e, confirmar: undefined }));
                  }}
                  error={errores.confirmar}
                  deshabilitado={guardando}
                />
              </>
            )}

            {errorGeneral && (
              <p
                role="alert"
                className="rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-medium text-lz-danger"
              >
                {errorGeneral}
              </p>
            )}

            <button
              type="submit"
              disabled={guardando}
              className={`min-h-[44px] self-start rounded-2xl px-5 text-base font-semibold text-lz-surface transition-colors disabled:opacity-50 ${
                hayPin && modo === 'quitar' ? 'bg-lz-danger hover:opacity-90' : 'bg-lz-sage hover:bg-lz-sage-dark'
              }`}
            >
              {guardando ? 'Guardando…' : titulo}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

interface CampoPinProps {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  error?: string;
  deshabilitado: boolean;
}

function CampoPin({ etiqueta, valor, onCambio, error, deshabilitado }: CampoPinProps) {
  const id = useId();
  const idError = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-lz-charcoal-muted">
        {etiqueta}
      </label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={8}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={`min-h-[44px] w-full rounded-2xl border-2 bg-lz-surface px-3 text-base tracking-[0.3em] text-lz-charcoal focus:outline-none disabled:bg-lz-oat sm:max-w-xs ${
          error ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
        }`}
      />
      {error && (
        <p id={idError} role="alert" className="text-sm font-medium text-lz-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export default ConfigPin;
