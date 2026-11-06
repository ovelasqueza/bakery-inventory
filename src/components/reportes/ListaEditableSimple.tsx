'use client';

// Lista de parámetros con nombre y estado activo (crear, renombrar, activar y desactivar; sin borrar).
// La usan ConfigCategoriasGasto y ConfigPersonas, y comparte ayudantes con ConfigMetodosPago
// (Req 14.3, 14.4, 14.8, 14.9, 14.10, 14.12).

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { ErrorApp } from '@/lib/api/errores';
import { nombreRepetido, validarTextoLargo } from '@/lib/caja/validacion';

// ---- Ayudantes compartidos ----

export const MENSAJE_REPETIDO = 'Ya existe ese nombre';
export const MENSAJE_SIN_EFECTIVO = 'Debe quedar al menos un método de pago en efectivo activo';
export const MENSAJE_GUARDADO = 'Guardado';

export function codigoDe(e: unknown): string {
  return e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
}

/** Mensaje general cuando falla un guardado; el valor escrito se conserva en pantalla (Req 14.12). */
export function mensajeErrorGuardar(e: unknown): string {
  const codigo = codigoDe(e);
  if (codigo === 'SIN_CONEXION') return 'Sin conexión. No se guardó; revise el internet e intente de nuevo.';
  if (codigo === 'NOMBRE_REPETIDO') return MENSAJE_REPETIDO;
  if (codigo === 'SIN_METODO_EFECTIVO') return MENSAJE_SIN_EFECTIVO;
  return 'No se guardó. Intente de nuevo.';
}

/** Valida un nombre de catálogo: 1..max caracteres y sin repetir (Req 14.9). Devuelve el error o el valor limpio. */
export function revisarNombre(
  texto: string,
  max: number,
  existentes: { id: string; nombre: string }[],
  idPropio?: string,
): { ok: true; valor: string } | { ok: false; error: string } {
  const r = validarTextoLargo(texto, 1, max);
  if (!r.ok) return { ok: false, error: r.error === 'CORTO' ? 'Escriba el nombre.' : `Máximo ${max} caracteres.` };
  if (nombreRepetido(r.valor, existentes, idPropio)) return { ok: false, error: MENSAJE_REPETIDO };
  return { ok: true, valor: r.valor };
}

export function claseCampo(conError: boolean): string {
  return `min-h-[44px] w-full rounded-2xl border-2 bg-lz-surface px-3 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
    conError ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
  }`;
}

export const CLASE_BOTON_PRIMARIO =
  'min-h-[44px] min-w-[44px] rounded-2xl bg-lz-sage px-5 text-base font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark disabled:opacity-50';

export const CLASE_BOTON_SECUNDARIO =
  'min-h-[44px] min-w-[44px] rounded-2xl border-2 border-lz-border bg-lz-surface px-4 text-sm font-semibold text-lz-charcoal transition-colors hover:border-lz-sage-medium hover:bg-lz-sage-light disabled:opacity-50';

/** Interruptor sí/no accesible de 44 px de alto. */
export function Interruptor({
  activo,
  etiqueta,
  onCambiar,
  deshabilitado = false,
}: {
  activo: boolean;
  etiqueta: string;
  onCambiar: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={onCambiar}
      disabled={deshabilitado}
      className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-2xl px-2 text-sm font-semibold text-lz-charcoal transition-colors hover:bg-lz-sage-light disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
          activo ? 'bg-lz-sage' : 'bg-lz-sand'
        }`}
      >
        <span
          className={`absolute h-5 w-5 rounded-full bg-lz-surface shadow-lz-soft transition-transform ${
            activo ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
      <span>{etiqueta}</span>
    </button>
  );
}

export function NotaDesactivados({ texto }: { texto?: string }) {
  return (
    <p className="rounded-2xl bg-lz-sage-light px-4 py-3 text-sm text-lz-charcoal-muted">
      {texto ??
        'Nada se borra: lo desactivado se conserva en las ventas, gastos, turnos y reportes donde ya se usó, y deja de aparecer en la Caja desde la próxima vez que se cargue la pantalla.'}
    </p>
  );
}

export function MensajeError({ id, texto }: { id?: string; texto: string }) {
  return (
    <p id={id} role="alert" className="text-sm font-medium text-lz-danger">
      {texto}
    </p>
  );
}

/** Carga de una lista con estado de carga y error con reintento. */
export function useListaParametros<T extends { id: string }>(
  cargar: () => Promise<T[]>,
  ordenar: (a: T, b: T) => number,
) {
  const [items, setItems] = useState<T[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const lista = await cargar();
      setItems([...lista].sort(ordenar));
    } catch (e) {
      setErrorCarga(
        codigoDe(e) === 'SIN_CONEXION' ? 'Sin conexión. No se pudo cargar la lista.' : 'No se pudo cargar la lista.',
      );
    } finally {
      setCargando(false);
    }
  }, [cargar, ordenar]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Reemplaza (o agrega) un elemento guardado y mantiene el orden. */
  const ponerItem = useCallback(
    (nuevo: T) => {
      setItems((prev) => {
        const sin = prev.filter((p) => p.id !== nuevo.id);
        return [...sin, nuevo].sort(ordenar);
      });
    },
    [ordenar],
  );

  return { items, cargando, errorCarga, recargar, ponerItem };
}

export function EstadoCarga({
  cargando,
  errorCarga,
  vacio,
  textoVacio,
  onReintentar,
}: {
  cargando: boolean;
  errorCarga: string | null;
  vacio: boolean;
  textoVacio: string;
  onReintentar: () => void;
}) {
  if (errorCarga) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <MensajeError texto={errorCarga} />
        <button type="button" onClick={onReintentar} disabled={cargando} className={CLASE_BOTON_SECUNDARIO}>
          Reintentar
        </button>
      </div>
    );
  }
  if (cargando && vacio) return <p className="text-base text-lz-charcoal-muted">Cargando…</p>;
  if (vacio) return <p className="text-base text-lz-charcoal-muted">{textoVacio}</p>;
  return null;
}

// ---- Lista simple ----

export type ItemSimple = { id: string; nombre: string; activo: boolean };

export function ordenarPorNombre(a: { nombre: string }, b: { nombre: string }): number {
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
}

interface ListaEditableSimpleProps {
  titulo: string;
  /** Texto de la etiqueta del campo para crear, p. ej. "Nueva categoría". */
  etiquetaNueva: string;
  placeholder?: string;
  maxNombre: number;
  textoVacio: string;
  /** Texto informativo opcional al pie del panel. */
  nota?: string;
  /** Se llama después de crear o actualizar un elemento. */
  onCambio?: () => void;
  /** Deben ser funciones estables (definidas fuera del componente). */
  cargar: () => Promise<ItemSimple[]>;
  crear: (nombre: string) => Promise<ItemSimple>;
  actualizar: (id: string, cambios: { nombre?: string; activo?: boolean }) => Promise<ItemSimple>;
}

export function ListaEditableSimple({
  titulo,
  etiquetaNueva,
  placeholder,
  maxNombre,
  textoVacio,
  nota,
  onCambio,
  cargar,
  crear,
  actualizar,
}: ListaEditableSimpleProps) {
  const { showToast } = useToast();
  const idTitulo = useId();
  const idNuevo = useId();
  const { items, cargando, errorCarga, recargar, ponerItem } = useListaParametros(cargar, ordenarPorNombre);

  const [nuevo, setNuevo] = useState('');
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  async function alCrear(e: FormEvent) {
    e.preventDefault();
    if (creando) return;
    const r = revisarNombre(nuevo, maxNombre, items);
    if (!r.ok) {
      setErrorNuevo(r.error);
      return;
    }
    setErrorNuevo(null);
    setCreando(true);
    try {
      const creado = await crear(r.valor);
      ponerItem(creado);
      setNuevo('');
      showToast(MENSAJE_GUARDADO, 'success');
      onCambio?.();
    } catch (err) {
      setErrorNuevo(mensajeErrorGuardar(err));
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
        {titulo}
      </h3>

      <form onSubmit={alCrear} noValidate className="flex flex-col gap-1">
        <label htmlFor={idNuevo} className="text-sm font-medium text-lz-charcoal-muted">
          {etiquetaNueva}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={idNuevo}
            type="text"
            autoComplete="off"
            value={nuevo}
            placeholder={placeholder}
            onChange={(e) => setNuevo(e.target.value)}
            aria-invalid={errorNuevo ? true : undefined}
            aria-describedby={errorNuevo ? `${idNuevo}-error` : undefined}
            className={claseCampo(Boolean(errorNuevo))}
          />
          <button type="submit" disabled={creando} className={`${CLASE_BOTON_PRIMARIO} shrink-0`}>
            {creando ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
        {errorNuevo && <MensajeError id={`${idNuevo}-error`} texto={errorNuevo} />}
      </form>

      <EstadoCarga
        cargando={cargando}
        errorCarga={errorCarga}
        vacio={items.length === 0}
        textoVacio={textoVacio}
        onReintentar={() => void recargar()}
      />

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-lz-border rounded-2xl border border-lz-border">
          {items.map((item) => (
            <FilaSimple
              key={item.id}
              item={item}
              items={items}
              maxNombre={maxNombre}
              actualizar={actualizar}
              onGuardado={(g) => {
                ponerItem(g);
                showToast(MENSAJE_GUARDADO, 'success');
                onCambio?.();
              }}
            />
          ))}
        </ul>
      )}

      <NotaDesactivados texto={nota} />
    </section>
  );
}

function FilaSimple({
  item,
  items,
  maxNombre,
  actualizar,
  onGuardado,
}: {
  item: ItemSimple;
  items: ItemSimple[];
  maxNombre: number;
  actualizar: ListaEditableSimpleProps['actualizar'];
  onGuardado: (item: ItemSimple) => void;
}) {
  const idCampo = useId();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function empezarEdicion() {
    setNombre(item.nombre);
    setErrorNombre(null);
    setError(null);
    setEditando(true);
  }

  async function guardarNombre(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const r = revisarNombre(nombre, maxNombre, items, item.id);
    if (!r.ok) {
      setErrorNombre(r.error);
      return;
    }
    setErrorNombre(null);
    setError(null);
    if (r.valor === item.nombre) {
      setEditando(false);
      return;
    }
    setGuardando(true);
    try {
      const guardado = await actualizar(item.id, { nombre: r.valor });
      setEditando(false);
      onGuardado(guardado);
    } catch (err) {
      if (codigoDe(err) === 'NOMBRE_REPETIDO') setErrorNombre(MENSAJE_REPETIDO);
      else setError(mensajeErrorGuardar(err));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivo() {
    if (guardando) return;
    setError(null);
    setGuardando(true);
    try {
      onGuardado(await actualizar(item.id, { activo: !item.activo }));
    } catch (err) {
      setError(mensajeErrorGuardar(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      {editando ? (
        <form onSubmit={guardarNombre} noValidate className="flex flex-col gap-1">
          <label htmlFor={idCampo} className="sr-only">
            Nombre
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={idCampo}
              type="text"
              autoComplete="off"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-invalid={errorNombre ? true : undefined}
              aria-describedby={errorNombre ? `${idCampo}-error` : undefined}
              className={claseCampo(Boolean(errorNombre))}
            />
            <div className="flex shrink-0 gap-2">
              <button type="submit" disabled={guardando} className={CLASE_BOTON_PRIMARIO}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                disabled={guardando}
                className={CLASE_BOTON_SECUNDARIO}
              >
                Cancelar
              </button>
            </div>
          </div>
          {errorNombre && <MensajeError id={`${idCampo}-error`} texto={errorNombre} />}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`min-w-0 flex-1 break-words text-base font-semibold ${
              item.activo ? 'text-lz-charcoal' : 'text-lz-charcoal-muted'
            }`}
          >
            {item.nombre}
          </span>
          <Interruptor
            activo={item.activo}
            etiqueta={item.activo ? 'Activo' : 'Inactivo'}
            onCambiar={() => void cambiarActivo()}
            deshabilitado={guardando}
          />
          <button
            type="button"
            onClick={empezarEdicion}
            disabled={guardando}
            aria-label={`Editar ${item.nombre}`}
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

export default ListaEditableSimple;
