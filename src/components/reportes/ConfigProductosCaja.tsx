'use client';

// Configuración de productos en la Caja: visibilidad, orden y categoría (Req 14.6, 14.9, 14.10, 14.12, 14.13).
// Cada cambio se guarda por separado; las fotos y los precios se editan en Productos.

import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui';
import { ImagenProducto } from '@/components/caja/ImagenProducto';
import {
  actualizarProductoCaja,
  listarCategorias,
  productosConfigurables,
  type CategoriaProducto,
  type ProductoConfigurable,
} from '@/lib/api/parametros';
import { ErrorApp } from '@/lib/api/errores';
import { urlFoto } from '@/lib/api/fotos';
import { normalizarTexto } from '@/lib/caja/busqueda';
import { validarEnteroEnRango } from '@/lib/caja/validacion';
import { formatCurrency } from '@/lib/utils';

const ORDEN_MIN = 0;
const ORDEN_MAX = 9999;
const VALOR_SIN_CATEGORIA = '';

const MENSAJES_ORDEN = {
  VACIO: 'Escriba el orden.',
  NO_ENTERO: 'Use solo números enteros, sin signos ni puntos.',
  RANGO: `El orden debe estar entre ${ORDEN_MIN} y ${ORDEN_MAX}.`,
} as const;

type Cambios = { visibleCaja?: boolean; ordenCaja?: number; categoriaId?: string | null };

type EstadoFila = {
  /** Texto escrito en el campo de orden. */
  borradorOrden: string;
  /** Cambio que falló y se puede reintentar; mantiene en pantalla el valor escrito. */
  pendiente: Cambios | null;
  guardando: boolean;
  errorOrden: string | null;
  errorGuardado: string | null;
};

function estadoInicial(p: ProductoConfigurable): EstadoFila {
  return {
    borradorOrden: String(p.ordenCaja),
    pendiente: null,
    guardando: false,
    errorOrden: null,
    errorGuardado: null,
  };
}

function mensajeError(error: unknown): string {
  if (error instanceof ErrorApp && error.codigo === 'SIN_CONEXION') return 'Sin conexión';
  return 'No se pudo guardar. Intente de nuevo.';
}

export function ConfigProductosCaja() {
  const { showToast } = useToast();
  const idBusqueda = useId();

  const [productos, setProductos] = useState<ProductoConfigurable[]>([]);
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([]);
  const [filas, setFilas] = useState<Record<string, EstadoFila>>({});
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [lista, cats] = await Promise.all([productosConfigurables(), listarCategorias()]);
      setProductos(lista);
      setCategorias(cats);
      setFilas(Object.fromEntries(lista.map((p) => [p.id, estadoInicial(p)])));
    } catch (error) {
      setErrorCarga(
        error instanceof ErrorApp && error.codigo === 'SIN_CONEXION'
          ? 'Sin conexión'
          : 'No se pudieron cargar los productos.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = normalizarTexto(busqueda);
    if (q === '') return productos;
    return productos.filter((p) => normalizarTexto(p.nombre).includes(q));
  }, [productos, busqueda]);

  function actualizarFila(id: string, cambio: Partial<EstadoFila>) {
    setFilas((prev) => {
      const actual = prev[id];
      if (!actual) return prev;
      return { ...prev, [id]: { ...actual, ...cambio } };
    });
  }

  async function guardar(id: string, cambios: Cambios) {
    actualizarFila(id, { guardando: true, pendiente: cambios, errorGuardado: null });
    try {
      const actualizado = await actualizarProductoCaja(id, cambios);
      setProductos((prev) => prev.map((p) => (p.id === id ? actualizado : p)));
      actualizarFila(id, {
        guardando: false,
        pendiente: null,
        errorGuardado: null,
        errorOrden: null,
        borradorOrden: String(actualizado.ordenCaja),
      });
      showToast('Guardado', 'success');
    } catch (error) {
      // Se conserva el valor escrito para reintentar (Req 14.9).
      actualizarFila(id, { guardando: false, pendiente: cambios, errorGuardado: mensajeError(error) });
    }
  }

  function confirmarOrden(p: ProductoConfigurable) {
    const fila = filas[p.id];
    if (!fila || fila.guardando) return;
    const res = validarEnteroEnRango(fila.borradorOrden, ORDEN_MIN, ORDEN_MAX);
    if (!res.ok) {
      actualizarFila(p.id, { errorOrden: MENSAJES_ORDEN[res.error] });
      return;
    }
    actualizarFila(p.id, { errorOrden: null });
    const ordenMostrado = fila.pendiente?.ordenCaja ?? p.ordenCaja;
    if (res.valor === ordenMostrado && !fila.errorGuardado) return;
    void guardar(p.id, { ...(fila.pendiente ?? {}), ordenCaja: res.valor });
  }

  function alPresionarTeclaOrden(e: KeyboardEvent<HTMLInputElement>, p: ProductoConfigurable) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmarOrden(p);
    }
  }

  return (
    <section
      aria-label="Productos en la Caja"
      className="flex flex-col gap-4 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-lz-display text-lg font-semibold text-lz-charcoal">Productos en la Caja</h2>
        <p className="text-sm text-lz-charcoal-muted">
          Para cambiar fotos o precios, use{' '}
          <Link
            href="/productos"
            className="inline-flex min-h-[44px] items-center font-semibold text-lz-sage underline hover:text-lz-sage-dark"
          >
            Productos
          </Link>
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idBusqueda} className="text-sm font-medium text-lz-charcoal-muted">
          Buscar producto
        </label>
        <input
          id={idBusqueda}
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre del producto"
          className="min-h-[44px] w-full rounded-2xl border-2 border-lz-border bg-lz-surface px-3 text-base text-lz-charcoal focus:border-lz-sage focus:outline-none"
        />
      </div>

      {cargando && (
        <p role="status" className="py-6 text-center text-sm text-lz-charcoal-muted">
          Cargando productos…
        </p>
      )}

      {!cargando && errorCarga && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-medium text-lz-danger"
        >
          <span>{errorCarga}</span>
          <button
            type="button"
            onClick={() => void cargar()}
            className="min-h-[44px] rounded-2xl border-2 border-lz-danger px-4 text-sm font-semibold text-lz-danger hover:bg-lz-surface"
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !errorCarga && visibles.length === 0 && (
        <p role="status" className="rounded-2xl border border-lz-border bg-lz-oat px-4 py-8 text-center text-sm text-lz-charcoal-muted">
          {productos.length === 0 ? 'No hay productos para configurar.' : 'Ningún producto coincide con la búsqueda.'}
        </p>
      )}

      {!cargando && !errorCarga && visibles.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visibles.map((p) => {
            const fila = filas[p.id] ?? estadoInicial(p);
            const visibleCaja = fila.pendiente?.visibleCaja ?? p.visibleCaja;
            const categoriaId =
              fila.pendiente?.categoriaId !== undefined ? fila.pendiente.categoriaId : p.categoriaId;
            const idOrden = `orden-${p.id}`;
            const idCategoria = `categoria-${p.id}`;
            const idErrorOrden = `error-orden-${p.id}`;
            const categoriaExiste = categoriaId === null || categorias.some((c) => c.id === categoriaId);

            return (
              <li
                key={p.id}
                aria-busy={fila.guardando || undefined}
                className={`flex flex-col gap-3 rounded-2xl border border-lz-border bg-lz-linen p-3 ${
                  p.activo ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-lz-border">
                    <ImagenProducto nombre={p.nombre} imagenUrl={urlFoto(p.imagenPath)} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-semibold text-lz-charcoal">{p.nombre}</span>
                      {!p.activo && (
                        <span className="rounded-full bg-lz-sand px-2 py-0.5 text-xs font-semibold text-lz-charcoal-muted">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <span className={`text-sm ${p.precioVenta === null ? 'font-medium text-lz-danger' : 'text-lz-charcoal-muted'}`}>
                      {p.precioVenta === null ? 'Sin precio de venta: no sale en Caja' : formatCurrency(p.precioVenta)}
                    </span>
                  </div>
                  {fila.guardando && (
                    <span role="status" className="shrink-0 text-xs font-medium text-lz-charcoal-muted">
                      Guardando…
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 sm:flex-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={visibleCaja}
                      disabled={fila.guardando}
                      onClick={() => void guardar(p.id, { ...(fila.pendiente ?? {}), visibleCaja: !visibleCaja })}
                      className={`relative inline-flex h-[44px] w-[72px] shrink-0 items-center rounded-full border-2 transition-colors disabled:cursor-wait ${
                        visibleCaja ? 'border-lz-sage bg-lz-sage' : 'border-lz-border bg-lz-sand'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-block h-8 w-8 rounded-full bg-lz-surface shadow-lz-soft transition-transform ${
                          visibleCaja ? 'translate-x-[30px]' : 'translate-x-[4px]'
                        }`}
                      />
                    </button>
                    <span className="text-sm font-medium text-lz-charcoal">Visible en Caja</span>
                  </label>

                  <div className="flex flex-col gap-1 sm:w-32">
                    <label htmlFor={idOrden} className="text-sm font-medium text-lz-charcoal-muted">
                      Orden
                    </label>
                    <input
                      id={idOrden}
                      type="text"
                      inputMode="numeric"
                      value={fila.borradorOrden}
                      disabled={fila.guardando}
                      onChange={(e) => actualizarFila(p.id, { borradorOrden: e.target.value, errorOrden: null })}
                      onBlur={() => confirmarOrden(p)}
                      onKeyDown={(e) => alPresionarTeclaOrden(e, p)}
                      aria-invalid={fila.errorOrden ? true : undefined}
                      aria-describedby={fila.errorOrden ? idErrorOrden : undefined}
                      className={`min-h-[44px] w-full rounded-2xl border-2 bg-lz-surface px-3 text-base text-lz-charcoal focus:outline-none ${
                        fila.errorOrden ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
                      }`}
                    />
                    {fila.errorOrden && (
                      <p id={idErrorOrden} role="alert" className="text-xs font-medium text-lz-danger">
                        {fila.errorOrden}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 sm:flex-1">
                    <label htmlFor={idCategoria} className="text-sm font-medium text-lz-charcoal-muted">
                      Categoría
                    </label>
                    <select
                      id={idCategoria}
                      value={categoriaId ?? VALOR_SIN_CATEGORIA}
                      disabled={fila.guardando}
                      onChange={(e) =>
                        void guardar(p.id, {
                          ...(fila.pendiente ?? {}),
                          categoriaId: e.target.value === VALOR_SIN_CATEGORIA ? null : e.target.value,
                        })
                      }
                      className="min-h-[44px] w-full rounded-2xl border-2 border-lz-border bg-lz-surface px-3 text-base text-lz-charcoal focus:border-lz-sage focus:outline-none"
                    >
                      <option value={VALOR_SIN_CATEGORIA}>Sin categoría</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                      {!categoriaExiste && categoriaId && <option value={categoriaId}>Categoría desconocida</option>}
                    </select>
                  </div>
                </div>

                {fila.errorGuardado && (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-medium text-lz-danger"
                  >
                    <span>{fila.errorGuardado}</span>
                    {fila.pendiente && (
                      <button
                        type="button"
                        disabled={fila.guardando}
                        onClick={() => fila.pendiente && void guardar(p.id, fila.pendiente)}
                        className="min-h-[44px] rounded-2xl border-2 border-lz-danger px-4 text-sm font-semibold text-lz-danger hover:bg-lz-surface"
                      >
                        Reintentar
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default ConfigProductosCaja;
