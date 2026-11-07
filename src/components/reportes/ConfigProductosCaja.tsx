'use client';

// Configuración de productos en la Caja: visibilidad, orden y categoría (Req 14.6, 14.9, 14.10, 14.12, 14.13).
// Cada cambio se guarda por separado; las fotos y los precios se editan en Productos.

import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui';
import { ImagenProducto } from '@/components/caja/ImagenProducto';
import { ACEPTA_FOTOS, useFotoProducto, type EstadoFoto } from '@/components/productos/useFotoProducto';
import {
  actualizarProductoCaja,
  listarCategorias,
  productosConfigurables,
  type CategoriaProducto,
  type ProductoConfigurable,
  type PromocionConfigurable,
} from '@/lib/api/parametros';
import { ErrorApp } from '@/lib/api/errores';
import { urlFoto } from '@/lib/api/fotos';
import { normalizarTexto } from '@/lib/caja/busqueda';
import { validarEnteroEnRango } from '@/lib/caja/validacion';
import { formatCurrency } from '@/lib/utils';

const ORDEN_MIN = 0;
const ORDEN_MAX = 9999;
const VALOR_SIN_CATEGORIA = '';
const FILTRO_TODAS = 'todas';
const FILTRO_SIN_CATEGORIA = 'sin-categoria';

const MENSAJES_ORDEN = {
  VACIO: 'Escriba el orden.',
  NO_ENTERO: 'Use solo números enteros, sin signos ni puntos.',
  RANGO: `El orden debe estar entre ${ORDEN_MIN} y ${ORDEN_MAX}.`,
} as const;

const TEXTO_PROGRESO_FOTO: Record<EstadoFoto, string | null> = {
  listo: null,
  procesando: 'Preparando…',
  subiendo: 'Subiendo…',
  quitando: 'Quitando…',
};

function FotoFilaProducto({
  productoId,
  nombre,
  imagenPath,
  onCambio,
}: {
  productoId: string;
  nombre: string;
  imagenPath: string | null;
  onCambio: (nuevoPath: string | null) => void;
}) {
  const { inputRef, pathActual, estado, ocupado, abrirSelector, alEscogerArchivo } =
    useFotoProducto(productoId, imagenPath, onCambio);
  const progreso = TEXTO_PROGRESO_FOTO[estado];

  return (
    <>
      <button
        type="button"
        onClick={abrirSelector}
        disabled={ocupado}
        title={progreso ?? (pathActual ? `Cambiar foto de ${nombre}` : `Subir foto de ${nombre}`)}
        aria-label={pathActual ? `Cambiar foto de ${nombre}` : `Subir foto de ${nombre}`}
        className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-lz-border bg-lz-surface transition-colors hover:border-lz-sage focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage disabled:cursor-wait"
      >
        <ImagenProducto nombre={nombre} imagenUrl={urlFoto(pathActual)} />
        {!ocupado && (
          <span className="absolute inset-0 flex items-center justify-center bg-lz-charcoal/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <svg
              aria-hidden="true"
              className="h-5 w-5 text-lz-surface"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
        )}
        {ocupado && (
          <span className="absolute inset-0 flex items-center justify-center bg-lz-surface/80">
            <span
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-lz-sage border-t-transparent"
            />
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACEPTA_FOTOS}
        className="hidden"
        onChange={alEscogerArchivo}
        disabled={ocupado}
      />
    </>
  );
}

type Cambios = {
  visibleCaja?: boolean;
  ordenCaja?: number;
  categoriaId?: string | null;
  ventaPorMonto?: boolean;
  promocion?: PromocionConfigurable;
};

type EstadoFila = {
  /** Texto escrito en el campo de orden. */
  borradorOrden: string;
  /** Texto escrito en la cantidad de promoción. */
  borradorPromoCantidad: string;
  /** Texto escrito en el precio de promoción. */
  borradorPromoPrecio: string;
  /** Cambio que falló y se puede reintentar; mantiene en pantalla el valor escrito. */
  pendiente: Cambios | null;
  guardando: boolean;
  errorOrden: string | null;
  errorPromo: string | null;
  errorGuardado: string | null;
};

function estadoInicial(p: ProductoConfigurable): EstadoFila {
  return {
    borradorOrden: String(p.ordenCaja),
    borradorPromoCantidad: String(p.promocion?.cantidad ?? 8),
    borradorPromoPrecio: String(p.promocion?.precio ?? 3000),
    pendiente: null,
    guardando: false,
    errorOrden: null,
    errorPromo: null,
    errorGuardado: null,
  };
}

function mensajeError(error: unknown): string {
  if (error instanceof ErrorApp && error.codigo === 'SIN_CONEXION') return 'Sin conexión';
  return 'No se pudo guardar. Intente de nuevo.';
}

interface ConfigProductosCajaProps {
  versionCategorias?: number;
}

export function ConfigProductosCaja({ versionCategorias = 0 }: ConfigProductosCajaProps) {
  const { showToast } = useToast();
  const idBusqueda = useId();
  const idFiltroCategoria = useId();

  const [productos, setProductos] = useState<ProductoConfigurable[]>([]);
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([]);
  const [filas, setFilas] = useState<Record<string, EstadoFila>>({});
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>(FILTRO_TODAS);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    setErrorCarga(null);
    try {
      const [lista, cats] = await Promise.all([productosConfigurables(), listarCategorias()]);
      setProductos(lista);
      setCategorias(cats);
      setFilas((prev) =>
        Object.fromEntries(
          lista.map((p) => {
            const anterior = prev[p.id];
            if (!anterior || !silencioso) return [p.id, estadoInicial(p)];
            return [
              p.id,
              {
                ...anterior,
                borradorOrden: String(p.ordenCaja),
                borradorPromoCantidad: String(p.promocion?.cantidad ?? 8),
                borradorPromoPrecio: String(p.promocion?.precio ?? 3000),
              },
            ];
          }),
        ),
      );
    } catch (error) {
      if (!silencioso) {
        setErrorCarga(
          error instanceof ErrorApp && error.codigo === 'SIN_CONEXION'
            ? 'Sin conexión'
            : 'No se pudieron cargar los productos.',
        );
      }
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (versionCategorias > 0) {
      void cargar(true);
    }
  }, [versionCategorias, cargar]);

  useEffect(() => {
    if (
      filtroCategoria !== FILTRO_TODAS &&
      filtroCategoria !== FILTRO_SIN_CATEGORIA &&
      !categorias.some((c) => c.id === filtroCategoria)
    ) {
      setFiltroCategoria(FILTRO_TODAS);
    }
  }, [categorias, filtroCategoria]);

  const visibles = useMemo(() => {
    const q = normalizarTexto(busqueda);
    return productos.filter((p) => {
      if (q !== '' && !normalizarTexto(p.nombre).includes(q)) return false;
      if (filtroCategoria === FILTRO_TODAS) return true;
      if (filtroCategoria === FILTRO_SIN_CATEGORIA) return p.categoriaId === null;
      return p.categoriaId === filtroCategoria;
    });
  }, [productos, busqueda, filtroCategoria]);

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
        errorPromo: null,
        borradorOrden: String(actualizado.ordenCaja),
        borradorPromoCantidad: String(actualizado.promocion.cantidad),
        borradorPromoPrecio: String(actualizado.promocion.precio),
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

  function confirmarPromocion(p: ProductoConfigurable, nuevoActivo?: boolean) {
    const fila = filas[p.id];
    if (!fila || fila.guardando) return;
    const promoActual = fila.pendiente?.promocion ?? p.promocion;
    const activoFinal = nuevoActivo !== undefined ? nuevoActivo : promoActual.activo;

    // Si está desactivando la promoción, guarda de inmediato sin exigir validar los campos.
    if (nuevoActivo === false) {
      actualizarFila(p.id, { errorPromo: null });
      void guardar(p.id, {
        ...(fila.pendiente ?? {}),
        promocion: {
          activo: false,
          cantidad: promoActual.cantidad || 8,
          precio: promoActual.precio || 3000,
        },
      });
      return;
    }

    const resCant = validarEnteroEnRango(fila.borradorPromoCantidad, 1, 999);
    const resPrecio = validarEnteroEnRango(fila.borradorPromoPrecio, 1, 10_000_000);
    if (!resCant.ok) {
      actualizarFila(p.id, { errorPromo: 'La cantidad promo debe ser entre 1 y 999.' });
      return;
    }
    if (!resPrecio.ok) {
      actualizarFila(p.id, { errorPromo: 'El valor promo debe ser un número mayor a 0.' });
      return;
    }
    actualizarFila(p.id, { errorPromo: null });
    if (
      nuevoActivo === undefined &&
      resCant.valor === promoActual.cantidad &&
      resPrecio.valor === promoActual.precio &&
      !fila.errorGuardado
    ) {
      return;
    }
    void guardar(p.id, {
      ...(fila.pendiente ?? {}),
      ventaPorMonto: true,
      promocion: {
        activo: activoFinal,
        cantidad: resCant.valor,
        precio: resPrecio.valor,
      },
    });
  }

  function alPresionarTeclaOrden(e: KeyboardEvent<HTMLInputElement>, p: ProductoConfigurable) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmarOrden(p);
    }
  }

  function alCambiarFoto(id: string, nuevoPath: string | null) {
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, imagenPath: nuevoPath } : p)));
  }

  return (
    <section
      aria-label="Productos en la Caja"
      className="flex flex-col gap-4 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-lz-display text-lg font-semibold text-lz-charcoal">Productos en la Caja</h2>
          <p className="text-sm text-lz-charcoal-muted">
            Puedes subir o cambiar la foto directamente aquí. Para cambiar precios, use{' '}
            <Link
              href="/productos"
              className="inline-flex min-h-[44px] items-center font-semibold text-lz-sage underline hover:text-lz-sage-dark"
            >
              Productos
            </Link>
          </p>
        </div>
        <button
          type="button"
          disabled={cargando}
          onClick={async () => {
            await cargar();
            showToast('Productos actualizados', 'success');
          }}
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-2xl border-2 border-lz-border bg-lz-surface px-4 text-sm font-semibold text-lz-charcoal transition-colors hover:border-lz-sage-medium hover:bg-lz-sage-light disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {cargando ? 'Actualizando…' : 'Actualizar productos'}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
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

        <div className="flex flex-col gap-1 sm:w-64">
          <label htmlFor={idFiltroCategoria} className="text-sm font-medium text-lz-charcoal-muted">
            Filtrar por categoría
          </label>
          <select
            id={idFiltroCategoria}
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="min-h-[44px] w-full rounded-2xl border-2 border-lz-border bg-lz-surface px-3 text-base text-lz-charcoal focus:border-lz-sage focus:outline-none"
          >
            <option value={FILTRO_TODAS}>Todas las categorías</option>
            <option value={FILTRO_SIN_CATEGORIA}>Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
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
            const ventaPorMonto = fila.pendiente?.ventaPorMonto ?? Boolean(p.ventaPorMonto);
            const promo = fila.pendiente?.promocion ?? p.promocion;
            const categoriaId =
              fila.pendiente?.categoriaId !== undefined ? fila.pendiente.categoriaId : p.categoriaId;
            const idOrden = `orden-${p.id}`;
            const idCategoria = `categoria-${p.id}`;
            const idErrorOrden = `error-orden-${p.id}`;
            const idPromoCantidad = `promo-cant-${p.id}`;
            const idPromoPrecio = `promo-precio-${p.id}`;
            const categoriaExiste = categoriaId === null || categorias.some((c) => c.id === categoriaId);

            return (
              <li
                key={p.id}
                aria-busy={fila.guardando || undefined}
                className={`flex flex-col gap-3 rounded-2xl border border-lz-border bg-lz-linen p-3 ${
                  p.activo ? '' : 'opacity-60'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <FotoFilaProducto
                      productoId={p.id}
                      nombre={p.nombre}
                      imagenPath={p.imagenPath}
                      onCambio={(nuevoPath) => alCambiarFoto(p.id, nuevoPath)}
                    />
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
                  </div>
                  {fila.guardando && (
                    <span role="status" className="shrink-0 text-xs font-medium text-lz-charcoal-muted">
                      Guardando…
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex flex-wrap items-center gap-4 sm:flex-1">
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
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

                    <label
                      className="flex min-h-[44px] cursor-pointer items-center gap-3"
                      title="Muestra el botón $ / und en la esquina superior izquierda del producto en Caja para abrir el popup de accesos rápidos (funciona con o sin promoción)"
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={ventaPorMonto}
                        disabled={fila.guardando}
                        onClick={() =>
                          void guardar(p.id, { ...(fila.pendiente ?? {}), ventaPorMonto: !ventaPorMonto })
                        }
                        className={`relative inline-flex h-[44px] w-[72px] shrink-0 items-center rounded-full border-2 transition-colors disabled:cursor-wait ${
                          ventaPorMonto ? 'border-lz-sage bg-lz-sage' : 'border-lz-border bg-lz-sand'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-8 w-8 rounded-full bg-lz-surface shadow-lz-soft transition-transform ${
                            ventaPorMonto ? 'translate-x-[30px]' : 'translate-x-[4px]'
                          }`}
                        />
                      </button>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-lz-charcoal">Accesos rápidos ($ / und)</span>
                        <span className="text-xs text-lz-charcoal-muted">
                          {ventaPorMonto ? 'Botón $ / und activo en Caja' : 'Activar popup de montos y unidades'}
                        </span>
                      </div>
                    </label>
                  </div>

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

                {/* Configuración de Promoción opcional (solo si el producto además tiene promo especial) */}
                {(ventaPorMonto || promo.activo) && (
                  <div className="flex flex-col gap-2.5 rounded-xl border border-lz-border bg-lz-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={promo.activo}
                        disabled={fila.guardando}
                        onClick={() => confirmarPromocion(p, !promo.activo)}
                        className={`relative inline-flex h-[44px] w-[72px] shrink-0 items-center rounded-full border-2 transition-colors disabled:cursor-wait ${
                          promo.activo ? 'border-lz-amber bg-lz-amber' : 'border-lz-border bg-lz-sand'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-8 w-8 rounded-full bg-lz-surface shadow-lz-soft transition-transform ${
                            promo.activo ? 'translate-x-[30px]' : 'translate-x-[4px]'
                          }`}
                        />
                      </button>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-lz-charcoal">
                          {promo.activo ? 'Con promoción especial' : 'Sin promoción (precio normal)'}
                        </span>
                        <span className="text-xs text-lz-charcoal-muted">
                          {promo.activo
                            ? `Activa: ${promo.cantidad} und por ${formatCurrency(promo.precio)}`
                            : `Calcula directo a ${p.precioVenta ? formatCurrency(p.precioVenta) : '$ 0'} c/u (ej. $3.000 = ${
                                p.precioVenta && p.precioVenta > 0 ? Math.floor(3000 / p.precioVenta) : 0
                              } und)`}
                        </span>
                      </div>
                    </label>

                    {promo.activo && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex flex-col gap-1">
                          <label htmlFor={idPromoCantidad} className="text-xs font-medium text-lz-charcoal-muted">
                            Unidades promo
                          </label>
                          <input
                            id={idPromoCantidad}
                            type="text"
                            inputMode="numeric"
                            value={fila.borradorPromoCantidad}
                            disabled={fila.guardando}
                            onChange={(e) =>
                              actualizarFila(p.id, {
                                borradorPromoCantidad: e.target.value.replace(/\D/g, ''),
                                errorPromo: null,
                              })
                            }
                            onBlur={() => confirmarPromocion(p)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                confirmarPromocion(p);
                              }
                            }}
                            className="min-h-[40px] w-24 rounded-xl border border-lz-border bg-lz-linen px-3 text-sm font-semibold text-lz-charcoal focus:border-lz-sage focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label htmlFor={idPromoPrecio} className="text-xs font-medium text-lz-charcoal-muted">
                            Precio promo ($)
                          </label>
                          <input
                            id={idPromoPrecio}
                            type="text"
                            inputMode="numeric"
                            value={fila.borradorPromoPrecio}
                            disabled={fila.guardando}
                            onChange={(e) =>
                              actualizarFila(p.id, {
                                borradorPromoPrecio: e.target.value.replace(/\D/g, ''),
                                errorPromo: null,
                              })
                            }
                            onBlur={() => confirmarPromocion(p)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                confirmarPromocion(p);
                              }
                            }}
                            className="min-h-[40px] w-32 rounded-xl border border-lz-border bg-lz-linen px-3 text-sm font-semibold text-lz-charcoal focus:border-lz-sage focus:outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={fila.guardando}
                          onClick={() => confirmarPromocion(p)}
                          className="min-h-[40px] rounded-xl bg-lz-sage px-3.5 text-xs font-bold text-lz-surface hover:bg-lz-sage-dark disabled:opacity-50"
                        >
                          Guardar promo
                        </button>
                      </div>
                    )}

                    {fila.errorPromo && (
                      <p role="alert" className="w-full text-xs font-medium text-lz-danger">
                        {fila.errorPromo}
                      </p>
                    )}
                  </div>
                )}

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
