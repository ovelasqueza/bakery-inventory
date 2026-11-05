'use client';

// Base_Caja por defecto del Modulo_Parametrizacion (Req 14.5, 14.9, 14.10, 14.12).

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { guardarConfig, obtenerParametrosCaja } from '@/lib/api/parametros';
import { ErrorApp } from '@/lib/api/errores';
import { conMiles, textoMiles, validarEnteroEnRango } from '@/lib/caja/validacion';
import { formatCurrency } from '@/lib/utils';

const BASE_MAXIMA = 10_000_000;

const MENSAJES_VALIDACION = {
  VACIO: 'Escriba la base de caja.',
  NO_ENTERO: 'La base debe ser un número entero, sin comas ni decimales.',
  RANGO: `La base debe estar entre 0 y ${formatCurrency(BASE_MAXIMA)}.`,
} as const;

function mensajeServidor(error: unknown): string {
  if (error instanceof ErrorApp && error.codigo === 'SIN_CONEXION') {
    return 'Sin conexión. Revise el internet y vuelva a intentar.';
  }
  return 'No se pudo guardar la base. Intente de nuevo.';
}

interface ConfigBaseCajaProps {
  /** Base guardada, si quien lo usa ya la cargó. Sin este valor se consulta al montar. */
  valorInicial?: number;
  /** Se llama con el nuevo valor después de guardarlo. */
  onGuardado?: (valor: number) => void;
}

export function ConfigBaseCaja({ valorInicial, onGuardado }: ConfigBaseCajaProps) {
  const { showToast } = useToast();
  const idCampo = useId();
  const idMensaje = useId();

  const [guardado, setGuardado] = useState<number | null>(valorInicial ?? null);
  const [texto, setTexto] = useState(valorInicial !== undefined ? String(valorInicial) : '');
  const [cargando, setCargando] = useState(valorInicial === undefined);
  const [errorCarga, setErrorCarga] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(false);
    try {
      const p = await obtenerParametrosCaja();
      setGuardado(p.baseCajaDefecto);
      setTexto(textoMiles(p.baseCajaDefecto));
    } catch {
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (valorInicial === undefined) void cargar();
  }, [valorInicial, cargar]);

  useEffect(() => {
    if (valorInicial === undefined) return;
    setGuardado(valorInicial);
    setTexto(textoMiles(valorInicial));
    setError(null);
  }, [valorInicial]);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardando) return;
    const res = validarEnteroEnRango(texto, 0, BASE_MAXIMA);
    if (!res.ok) {
      // Req 14.9: no se guarda y el valor anterior sigue vigente.
      setError(MENSAJES_VALIDACION[res.error]);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await guardarConfig('base_caja_defecto', String(res.valor));
      setGuardado(res.valor);
      setTexto(textoMiles(res.valor));
      showToast('Base de caja guardada', 'success');
      onGuardado?.(res.valor);
    } catch (err) {
      // Req 14.12: se conserva el valor escrito para reintentar.
      setError(mensajeServidor(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section
      aria-labelledby={`${idCampo}-titulo`}
      className="flex flex-col gap-3 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft"
    >
      <div className="flex flex-col gap-1">
        <h3 id={`${idCampo}-titulo`} className="font-lz-display text-lg font-bold text-lz-charcoal">
          Base de caja por defecto
        </h3>
        <p className="text-sm text-lz-charcoal-muted">
          Valor que aparece al abrir un turno. Se usa desde la siguiente carga de la Caja.
        </p>
      </div>

      {cargando ? (
        <p role="status" className="text-sm text-lz-charcoal-muted">
          Cargando…
        </p>
      ) : errorCarga ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-3"
        >
          <p className="text-sm font-medium text-lz-danger">No se pudo cargar la base de caja.</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="min-h-[44px] self-start rounded-2xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="flex flex-col gap-2">
          <label htmlFor={idCampo} className="text-sm font-medium text-lz-charcoal-muted">
            Base (COP, de 0 a {formatCurrency(BASE_MAXIMA)})
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={idCampo}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={texto}
              onChange={(e) => {
                setTexto(conMiles(e.target.value));
                if (error) setError(null);
              }}
              disabled={guardando}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? idMensaje : undefined}
              className={`min-h-[44px] w-full rounded-2xl border-2 bg-lz-surface px-3 text-base text-lz-charcoal focus:outline-none disabled:bg-lz-oat sm:max-w-xs ${
                error ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
              }`}
            />
            <button
              type="submit"
              disabled={guardando}
              className="min-h-[44px] rounded-2xl bg-lz-sage px-5 text-base font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {guardado !== null && (
            <p className="text-sm text-lz-charcoal-muted">Guardada: {formatCurrency(guardado)}</p>
          )}
          {error && (
            <p
              id={idMensaje}
              role="alert"
              className="rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-medium text-lz-danger"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

export default ConfigBaseCaja;
