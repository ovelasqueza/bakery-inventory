'use client';

// Métodos de pago: crear, editar nombre y orden, activar/desactivar y marcar efectivo; sin borrar.
// Siempre debe quedar al menos un método de efectivo activo (Req 14.1, 14.2, 14.8–14.10, 14.12).

import { useId, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import {
  CLASE_BOTON_PRIMARIO,
  CLASE_BOTON_SECUNDARIO,
  EstadoCarga,
  Interruptor,
  MENSAJE_GUARDADO,
  MENSAJE_REPETIDO,
  MENSAJE_SIN_EFECTIVO,
  MensajeError,
  NotaDesactivados,
  claseCampo,
  codigoDe,
  mensajeErrorGuardar,
  revisarNombre,
  useListaParametros,
} from '@/components/reportes/ListaEditableSimple';
import {
  actualizarMetodoPago,
  crearMetodoPago,
  listarMetodosPago,
  type MetodoPagoParam,
} from '@/lib/api/parametros';
import { puedeAplicarCambioMetodo, validarEnteroEnRango } from '@/lib/caja/validacion';

const MAX_NOMBRE = 40;
const ORDEN_MAX = 999;

function ordenarMetodos(a: MetodoPagoParam, b: MetodoPagoParam): number {
  return a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
}

function revisarOrden(texto: string): { ok: true; valor: number } | { ok: false; error: string } {
  const r = validarEnteroEnRango(texto, 0, ORDEN_MAX);
  if (r.ok) return r;
  if (r.error === 'VACIO') return { ok: false, error: 'Escriba el orden.' };
  if (r.error === 'NO_ENTERO') return { ok: false, error: 'Escriba solo números enteros, sin puntos ni comas.' };
  return { ok: false, error: `El orden debe estar entre 0 y ${ORDEN_MAX}.` };
}

interface ErroresCampos {
  nombre?: string;
  orden?: string;
}

export function ConfigMetodosPago() {
  const { showToast } = useToast();
  const idTitulo = useId();
  const idNombre = useId();
  const idOrden = useId();
  const { items, cargando, errorCarga, recargar, ponerItem } = useListaParametros(
    listarMetodosPago,
    ordenarMetodos,
  );

  const [nombre, setNombre] = useState('');
  const [orden, setOrden] = useState('0');
  const [esEfectivo, setEsEfectivo] = useState(false);
  const [errores, setErrores] = useState<ErroresCampos>({});
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  function guardado(m: MetodoPagoParam) {
    ponerItem(m);
    showToast(MENSAJE_GUARDADO, 'success');
  }

  async function alCrear(e: FormEvent) {
    e.preventDefault();
    if (creando) return;
    const n = revisarNombre(nombre, MAX_NOMBRE, items);
    const o = revisarOrden(orden);
    setErrores({ nombre: n.ok ? undefined : n.error, orden: o.ok ? undefined : o.error });
    setErrorCrear(null);
    if (!n.ok || !o.ok) return;

    setCreando(true);
    try {
      guardado(await crearMetodoPago({ nombre: n.valor, esEfectivo, orden: o.valor }));
      setNombre('');
      setOrden('0');
      setEsEfectivo(false);
    } catch (err) {
      if (codigoDe(err) === 'NOMBRE_REPETIDO') setErrores({ nombre: MENSAJE_REPETIDO });
      else setErrorCrear(mensajeErrorGuardar(err));
    } finally {
      setCreando(false);
    }
  }

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-4 rounded-3xl border border-lz-border bg-lz-surface p-5 shadow-lz-card"
    >
      <h3 id={idTitulo} className="font-lz-display text-lg font-bold text-lz-charcoal">
        Métodos de pago
      </h3>

      <form onSubmit={alCrear} noValidate className="flex flex-col gap-3 rounded-2xl bg-lz-linen p-4">
        <p className="text-sm font-semibold text-lz-charcoal">Nuevo método de pago</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={idNombre} className="text-sm font-medium text-lz-charcoal-muted">
              Nombre
            </label>
            <input
              id={idNombre}
              type="text"
              autoComplete="off"
              value={nombre}
              placeholder="Ej: Nequi"
              onChange={(e) => setNombre(e.target.value)}
              aria-invalid={errores.nombre ? true : undefined}
              aria-describedby={errores.nombre ? `${idNombre}-error` : undefined}
              className={claseCampo(Boolean(errores.nombre))}
            />
            {errores.nombre && <MensajeError id={`${idNombre}-error`} texto={errores.nombre} />}
          </div>
          <div className="flex flex-col gap-1 sm:w-28">
            <label htmlFor={idOrden} className="text-sm font-medium text-lz-charcoal-muted">
              Orden
            </label>
            <input
              id={idOrden}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              aria-invalid={errores.orden ? true : undefined}
              aria-describedby={errores.orden ? `${idOrden}-error` : undefined}
              className={`${claseCampo(Boolean(errores.orden))} tabular-nums`}
            />
            {errores.orden && <MensajeError id={`${idOrden}-error`} texto={errores.orden} />}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Interruptor activo={esEfectivo} etiqueta="Es efectivo" onCambiar={() => setEsEfectivo((v) => !v)} />
          <button type="submit" disabled={creando} className={CLASE_BOTON_PRIMARIO}>
            {creando ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
        {errorCrear && <MensajeError texto={errorCrear} />}
      </form>

      <EstadoCarga
        cargando={cargando}
        errorCarga={errorCarga}
        vacio={items.length === 0}
        textoVacio="Todavía no hay métodos de pago."
        onReintentar={() => void recargar()}
      />

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-lz-border rounded-2xl border border-lz-border">
          {items.map((m) => (
            <FilaMetodo key={m.id} metodo={m} metodos={items} onGuardado={guardado} />
          ))}
        </ul>
      )}

      <p className="text-sm text-lz-charcoal-muted">
        Los métodos se muestran en la Caja de menor a mayor orden. Debe quedar al menos uno de efectivo activo.
      </p>
      <NotaDesactivados />
    </section>
  );
}

function FilaMetodo({
  metodo,
  metodos,
  onGuardado,
}: {
  metodo: MetodoPagoParam;
  metodos: MetodoPagoParam[];
  onGuardado: (m: MetodoPagoParam) => void;
}) {
  const idNombre = useId();
  const idOrden = useId();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(metodo.nombre);
  const [orden, setOrden] = useState(String(metodo.orden));
  const [errores, setErrores] = useState<ErroresCampos>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function empezarEdicion() {
    setNombre(metodo.nombre);
    setOrden(String(metodo.orden));
    setErrores({});
    setError(null);
    setEditando(true);
  }

  async function guardarEdicion(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const n = revisarNombre(nombre, MAX_NOMBRE, metodos, metodo.id);
    const o = revisarOrden(orden);
    setErrores({ nombre: n.ok ? undefined : n.error, orden: o.ok ? undefined : o.error });
    setError(null);
    if (!n.ok || !o.ok) return;

    const cambios: { nombre?: string; orden?: number } = {};
    if (n.valor !== metodo.nombre) cambios.nombre = n.valor;
    if (o.valor !== metodo.orden) cambios.orden = o.valor;
    if (cambios.nombre === undefined && cambios.orden === undefined) {
      setEditando(false);
      return;
    }

    setGuardando(true);
    try {
      const guardado = await actualizarMetodoPago(metodo.id, cambios);
      setEditando(false);
      onGuardado(guardado);
    } catch (err) {
      if (codigoDe(err) === 'NOMBRE_REPETIDO') setErrores({ nombre: MENSAJE_REPETIDO });
      else setError(mensajeErrorGuardar(err));
    } finally {
      setGuardando(false);
    }
  }

  /** Activo o efectivo: si el cambio quita uno de los dos, revisa que quede un efectivo activo (Req 14.2). */
  async function cambiar(cambio: { activo: boolean } | { esEfectivo: boolean }) {
    if (guardando) return;
    setError(null);
    const quita = ('activo' in cambio && !cambio.activo) || ('esEfectivo' in cambio && !cambio.esEfectivo);
    if (quita && !puedeAplicarCambioMetodo(metodos, { id: metodo.id, ...cambio })) {
      setError(MENSAJE_SIN_EFECTIVO);
      return;
    }
    setGuardando(true);
    try {
      onGuardado(await actualizarMetodoPago(metodo.id, cambio));
    } catch (err) {
      setError(mensajeErrorGuardar(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      {editando ? (
        <form onSubmit={guardarEdicion} noValidate className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={idNombre} className="text-sm font-medium text-lz-charcoal-muted">
                Nombre
              </label>
              <input
                id={idNombre}
                type="text"
                autoComplete="off"
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                aria-invalid={errores.nombre ? true : undefined}
                aria-describedby={errores.nombre ? `${idNombre}-error` : undefined}
                className={claseCampo(Boolean(errores.nombre))}
              />
              {errores.nombre && <MensajeError id={`${idNombre}-error`} texto={errores.nombre} />}
            </div>
            <div className="flex flex-col gap-1 sm:w-28">
              <label htmlFor={idOrden} className="text-sm font-medium text-lz-charcoal-muted">
                Orden
              </label>
              <input
                id={idOrden}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
                aria-invalid={errores.orden ? true : undefined}
                aria-describedby={errores.orden ? `${idOrden}-error` : undefined}
                className={`${claseCampo(Boolean(errores.orden))} tabular-nums`}
              />
              {errores.orden && <MensajeError id={`${idOrden}-error`} texto={errores.orden} />}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditando(false)}
              disabled={guardando}
              className={CLASE_BOTON_SECUNDARIO}
            >
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className={CLASE_BOTON_PRIMARIO}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-[44px] rounded-xl bg-lz-oat px-2 py-1 text-center text-sm font-semibold tabular-nums text-lz-charcoal-muted">
            {metodo.orden}
          </span>
          <span
            className={`min-w-0 flex-1 break-words text-base font-semibold ${
              metodo.activo ? 'text-lz-charcoal' : 'text-lz-charcoal-muted'
            }`}
          >
            {metodo.nombre}
          </span>
          <Interruptor
            activo={metodo.esEfectivo}
            etiqueta="Efectivo"
            onCambiar={() => void cambiar({ esEfectivo: !metodo.esEfectivo })}
            deshabilitado={guardando}
          />
          <Interruptor
            activo={metodo.activo}
            etiqueta={metodo.activo ? 'Activo' : 'Inactivo'}
            onCambiar={() => void cambiar({ activo: !metodo.activo })}
            deshabilitado={guardando}
          />
          <button
            type="button"
            onClick={empezarEdicion}
            disabled={guardando}
            aria-label={`Editar ${metodo.nombre}`}
            className={CLASE_BOTON_SECUNDARIO}
          >
            Editar
          </button>
        </div>
      )}
      {error && <MensajeError texto={error} />}
    </li>
  );
}

export default ConfigMetodosPago;
