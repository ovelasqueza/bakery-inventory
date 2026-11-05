'use client';

// Registro del Autoconsumo: quién consumió, nota opcional y resumen con el valor a precio de venta
// (Req 9.1, 9.2, 9.5, 9.6, 9.9). No cobra dinero ni mueve el cajón.

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';
import { SelectorPersona } from '@/components/caja/SelectorPersona';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import { registrarAutoconsumo, type Autoconsumo } from '@/lib/api/autoconsumo';
import { ErrorApp } from '@/lib/api/errores';
import type { PersonaCajaParam } from '@/lib/api/parametros';
import {
  NOTA_MAX,
  firmaAutoconsumo,
  textoProductos,
  validarAutoconsumo,
  valorReferencia,
  type ErroresAutoconsumo,
} from '@/lib/caja/autoconsumo';
import type { Carrito } from '@/lib/caja/carrito';
import { formatCurrency } from '@/lib/utils';

const MENSAJE_NO_GUARDADO = 'No se guardó. Intente de nuevo.';
const MENSAJE_DATOS_INVALIDOS = 'Revise los datos e intente de nuevo.';
const MENSAJE_PRODUCTOS = 'Algunos productos ya no están disponibles. Revise la selección.';

export interface DialogoAutoconsumoProps {
  turnoId: string;
  /** Seleccion_Autoconsumo que se va a registrar. */
  seleccion: Carrito;
  personas: PersonaCajaParam[];
  /** Quedó registrado: el padre vacía la Seleccion_Autoconsumo (Req 9.9). Luego se llama `onCerrar`. */
  onRegistrado: (autoconsumo: Autoconsumo) => void;
  /** El turno ya estaba cerrado: hay que mostrar la apertura (Req 9.5). */
  onTurnoCerrado: () => void;
  /** `PRODUCTO_NO_DISPONIBLE`: el padre recarga el catálogo y concilia la selección (Req 9.6). */
  onProductosCambiaron: () => void;
  onCerrar: () => void;
}

interface AutoconsumoValido {
  persona: string;
  nota: string | null;
  lineas: { productoId: string; cantidad: number }[];
}

/** Registro que falló sin conexión; "Reintentar" lo repite con la misma clave. */
interface FalloConexion {
  datos: AutoconsumoValido;
  clave: string;
}

function codigoDe(e: unknown): string {
  return e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
}

function mensajePersona(error: ErroresAutoconsumo['persona']): string | undefined {
  if (error === 'VACIO') return 'Escoja o escriba quién lo consumió.';
  if (error === 'LARGO') return 'Máximo 60 caracteres.';
  return undefined;
}

export function DialogoAutoconsumo({
  turnoId,
  seleccion,
  personas,
  onRegistrado,
  onTurnoCerrado,
  onProductosCambiaron,
  onCerrar,
}: DialogoAutoconsumoProps) {
  const { showToast } = useToast();
  const idNota = useId();
  const idTitulo = useId();

  const [persona, setPersona] = useState('');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<ErroresAutoconsumo>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [falloConexion, setFalloConexion] = useState<FalloConexion | null>(null);

  // La clave cambia solo si cambian turno, selección, persona o nota (Req 9.8).
  const { clave } = useClaveIdempotente(firmaAutoconsumo(turnoId, seleccion, persona, nota));

  const resumen = textoProductos(seleccion);
  const valor = valorReferencia(seleccion);

  const turnoCerrado = useCallback(() => {
    showToast('El turno ya fue cerrado', 'warning');
    onTurnoCerrado();
  }, [onTurnoCerrado, showToast]);

  function validar(): AutoconsumoValido | null {
    const r = validarAutoconsumo({ seleccion, persona, nota });
    if (!r.ok) {
      setErrores(r.errores);
      return null;
    }
    setErrores({});
    return {
      persona: r.persona,
      nota: r.nota,
      lineas: seleccion.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
    };
  }

  async function enviar(datos: AutoconsumoValido, claveUsada: string = clave) {
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const a = await registrarAutoconsumo({ clave: claveUsada, turnoId, ...datos });
      setFalloConexion(null);
      showToast('Autoconsumo registrado', 'success');
      onRegistrado(a);
      onCerrar();
    } catch (e) {
      const codigo = codigoDe(e);
      setFalloConexion(null);
      if (codigo === 'TURNO_CERRADO' || codigo === 'TURNO_NO_ABIERTO') turnoCerrado();
      else if (codigo === 'SIN_CONEXION') setFalloConexion({ datos, clave: claveUsada });
      else if (codigo === 'PRODUCTO_NO_DISPONIBLE') {
        setErrorGuardar(MENSAJE_PRODUCTOS);
        onProductosCambiaron();
      } else if (codigo === 'DATOS_INVALIDOS') setErrorGuardar(MENSAJE_DATOS_INVALIDOS);
      else setErrorGuardar(MENSAJE_NO_GUARDADO);
    } finally {
      setGuardando(false);
    }
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const datos = validar();
    if (datos) void enviar(datos);
  }

  function reintentar() {
    if (falloConexion) void enviar(falloConexion.datos, falloConexion.clave);
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
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-lz-linen shadow-lz-float">
        <header className="flex items-center justify-between gap-3 border-b border-lz-border bg-lz-surface px-5 py-3">
          <h2 id={idTitulo} className="font-lz-display text-xl font-bold text-lz-charcoal">
            Registrar autoconsumo
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
          {/* Resumen de productos y Valor_Referencia (Req 9.1) */}
          <section aria-label="Resumen del autoconsumo" className="flex flex-col gap-2 rounded-2xl border border-lz-border bg-lz-surface p-4">
            <p className="text-sm font-medium text-lz-charcoal-muted">Productos</p>
            {seleccion.length > 0 ? (
              <p className="break-words text-base font-semibold text-lz-charcoal">{resumen}</p>
            ) : (
              <p className="text-base text-lz-charcoal-muted">No hay productos seleccionados.</p>
            )}
            {errores.lineas && (
              <p role="alert" className="text-sm font-medium text-lz-danger">
                Escoja al menos un producto.
              </p>
            )}
            <div className="flex items-end justify-between gap-3 border-t border-lz-border pt-2">
              <p className="text-sm text-lz-charcoal-muted">Valor a precio de venta (no se cobra)</p>
              <p className="font-lz-display text-2xl font-bold tabular-nums text-lz-charcoal">{formatCurrency(valor)}</p>
            </div>
          </section>

          {falloConexion && <AvisoSinConexion onReintentar={reintentar} reintentando={guardando} />}

          <SelectorPersona
            personas={personas}
            value={persona}
            onChange={setPersona}
            error={mensajePersona(errores.persona)}
            etiqueta="¿Quién lo consumió?"
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
              placeholder="Ej: Desayuno"
              disabled={guardando}
              aria-invalid={errores.nota ? true : undefined}
              aria-describedby={errores.nota ? `${idNota}-error` : undefined}
              className={`min-h-[48px] w-full rounded-2xl border-2 bg-lz-surface px-4 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
                errores.nota ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
              }`}
            />
            {errores.nota && (
              <p id={`${idNota}-error`} role="alert" className="text-sm font-medium text-lz-danger">
                Máximo {NOTA_MAX} caracteres.
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
              {guardando ? 'Guardando…' : 'Registrar autoconsumo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DialogoAutoconsumo;
