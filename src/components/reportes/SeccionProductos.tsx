'use client';

// Productos vendidos con cantidad y valor, sin ventas anuladas (Req 12.3),
// más analizador interactivo de comportamiento por producto (días en que más se vende y horas pico).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { Rango } from '@/lib/fechas/bogota';
import {
  obtenerLineasProductoRango,
  obtenerProductosCatalogoReporte,
} from '@/lib/api/reportes';
import {
  analizarComportamientoProducto,
  type AnalisisProducto,
} from '@/lib/reportes/analisisProducto';
import type { Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

const VALOR_ID = '__VALOR__';

interface SeccionProductosProps {
  reporte: Reporte;
  rango: Rango;
}

interface OpcionProducto {
  clave: string; // UUID o VALOR_ID
  productoId: string | null;
  nombre: string;
  cantidadEnRango: number;
  valorEnRango: number;
}

function formatearFechaCorta(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

export function SeccionProductos({ reporte, rango }: SeccionProductosProps) {
  const idSelect = useId();
  const idBuscar = useId();
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'productos', 'pantalla'), [reporte]);

  const [catalogo, setCatalogo] = useState<{ id: string; nombre: string }[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [claveSeleccionada, setClaveSeleccionada] = useState<string>('');
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  const [analisis, setAnalisis] = useState<AnalisisProducto | null>(null);
  const peticionRef = useRef(0);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelado = false;
    obtenerProductosCatalogoReporte()
      .then((lista) => {
        if (!cancelado) setCatalogo(lista);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const opciones = useMemo<OpcionProducto[]>(() => {
    const mapa = new Map<string, OpcionProducto>();
    for (const p of reporte.productos) {
      const clave = p.productoId ?? VALOR_ID;
      mapa.set(clave, {
        clave,
        productoId: p.productoId,
        nombre: p.nombre,
        cantidadEnRango: p.cantidad,
        valorEnRango: p.valor,
      });
    }
    for (const c of catalogo) {
      if (!mapa.has(c.id)) {
        mapa.set(c.id, {
          clave: c.id,
          productoId: c.id,
          nombre: c.nombre,
          cantidadEnRango: 0,
          valorEnRango: 0,
        });
      }
    }
    return Array.from(mapa.values()).sort(
      (a, b) => b.cantidadEnRango - a.cantidadEnRango || a.nombre.localeCompare(b.nombre, 'es'),
    );
  }, [reporte.productos, catalogo]);

  const opcionesFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter((o) => o.nombre.toLowerCase().includes(q));
  }, [opciones, busqueda]);

  // Selecciona por defecto el primer producto con ventas en el rango (o el primero disponible).
  useEffect(() => {
    if (opciones.length === 0) {
      setClaveSeleccionada('');
      return;
    }
    setClaveSeleccionada((prev) => {
      if (prev && opciones.some((o) => o.clave === prev)) return prev;
      const primeroConProducto = opciones.find((o) => o.productoId !== null) ?? opciones[0];
      return primeroConProducto.clave;
    });
  }, [opciones]);

  const productoActivo = useMemo(
    () => opciones.find((o) => o.clave === claveSeleccionada) ?? null,
    [opciones, claveSeleccionada],
  );

  // Carga las líneas del producto seleccionado dentro del rango para calcular días y horas.
  useEffect(() => {
    if (!productoActivo) {
      setAnalisis(null);
      return;
    }
    const idPeticion = ++peticionRef.current;
    setCargandoDetalle(true);
    setErrorDetalle(null);

    obtenerLineasProductoRango(rango, productoActivo.productoId)
      .then((lineas) => {
        if (peticionRef.current !== idPeticion) return;
        setAnalisis(analizarComportamientoProducto(lineas));
        setCargandoDetalle(false);
      })
      .catch(() => {
        if (peticionRef.current !== idPeticion) return;
        setErrorDetalle('No se pudo cargar el comportamiento detallado del producto.');
        setCargandoDetalle(false);
      });
  }, [productoActivo, rango]);

  const indiceFilaSeleccionada = useMemo(() => {
    if (!productoActivo) return null;
    const idx = reporte.productos.findIndex(
      (p) => (p.productoId ?? VALOR_ID) === productoActivo.clave,
    );
    return idx >= 0 ? idx : null;
  }, [reporte.productos, productoActivo]);

  function seleccionarDesdeTabla(filaIdx: number) {
    const prod = reporte.productos[filaIdx];
    if (!prod) return;
    const clave = prod.productoId ?? VALOR_ID;
    setClaveSeleccionada(clave);
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const maxDiaSemana = useMemo(
    () => Math.max(1, ...(analisis?.porDiaSemana.map((d) => d.cantidad) ?? [1])),
    [analisis],
  );
  const maxHora = useMemo(
    () => Math.max(1, ...(analisis?.porHora.map((h) => h.cantidad) ?? [1])),
    [analisis],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Panel interactivo de análisis de comportamiento por producto */}
      <section
        ref={panelRef}
        aria-label="Comportamiento por producto"
        className="flex flex-col gap-4 rounded-2xl border-2 border-lz-sage-tint bg-lz-surface p-3.5 shadow-lz-soft sm:p-5"
      >
        <div className="flex flex-col gap-1">
          <h3 className="font-lz-display text-base font-bold text-lz-charcoal sm:text-lg">
            Análisis por producto (días y horas de mayor venta)
          </h3>
          <p className="text-xs text-lz-charcoal-muted sm:text-sm">
            Elija un producto de la lista o toque &ldquo;Analizar&rdquo; en la tabla para ver qué días se vende más y cómo se comporta durante el día.
          </p>
        </div>

        {/* Selector de producto con buscador rápido */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
          <div className="flex flex-col gap-1 sm:col-span-5">
            <label htmlFor={idBuscar} className="text-xs font-semibold text-lz-charcoal-muted">
              Buscar producto
            </label>
            <input
              id={idBuscar}
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Ej. Pan bono, Croissant, Gaseosa…"
              className="min-h-[42px] w-full rounded-xl border-2 border-lz-border bg-lz-linen/50 px-3 text-sm text-lz-charcoal focus:border-lz-sage focus:bg-lz-surface focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1 sm:col-span-7">
            <label htmlFor={idSelect} className="text-xs font-semibold text-lz-charcoal-muted">
              Producto seleccionado ({opcionesFiltradas.length})
            </label>
            <select
              id={idSelect}
              value={claveSeleccionada}
              onChange={(e) => setClaveSeleccionada(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border-2 border-lz-sage bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal focus:outline-none"
            >
              {opcionesFiltradas.length === 0 ? (
                <option value="">Sin coincidencias</option>
              ) : (
                opcionesFiltradas.map((op) => (
                  <option key={op.clave} value={op.clave}>
                    {op.nombre} — {op.cantidadEnRango} und. ({formatCurrency(op.valorEnRango)})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Chips rápidos de los 6 productos más vendidos */}
        {reporte.productos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-lz-charcoal-muted">Más vendidos:</span>
            {reporte.productos.slice(0, 6).map((p) => {
              const clave = p.productoId ?? VALOR_ID;
              const activo = clave === claveSeleccionada;
              return (
                <button
                  key={clave}
                  type="button"
                  onClick={() => setClaveSeleccionada(clave)}
                  className={`rounded-xl border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    activo
                      ? 'border-lz-sage bg-lz-sage text-lz-surface'
                      : 'border-lz-border bg-lz-linen text-lz-charcoal hover:bg-lz-sage-light'
                  }`}
                >
                  {p.nombre} ({p.cantidad})
                </button>
              );
            })}
          </div>
        )}

        {/* Estado de carga o detalle del producto */}
        {cargandoDetalle ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-lz-linen py-8 text-sm text-lz-charcoal-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-lz-sage-light border-t-lz-sage" />
            Analizando ventas de {productoActivo?.nombre ?? 'producto'}…
          </div>
        ) : errorDetalle ? (
          <div className="rounded-xl border border-lz-danger-border bg-lz-danger-surface p-3 text-sm text-lz-danger">
            {errorDetalle}
          </div>
        ) : analisis && productoActivo ? (
          analisis.totalUnidades === 0 ? (
            <div className="rounded-xl border border-lz-border bg-lz-linen p-4 text-center text-sm text-lz-charcoal-muted">
              <strong>{productoActivo.nombre}</strong> no registra unidades vendidas en este rango de fechas. Pruebe seleccionando &ldquo;Últimos 7 días&rdquo; o &ldquo;Este mes&rdquo;.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* KPIs del producto */}
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="flex flex-col gap-0.5 rounded-xl border border-lz-border bg-lz-linen/70 p-3">
                  <dt className="text-xs text-lz-charcoal-muted">Unidades vendidas</dt>
                  <dd className="font-lz-display text-lg font-bold tabular-nums text-lz-charcoal">
                    {analisis.totalUnidades} und.
                  </dd>
                  <span className="text-[11px] text-lz-charcoal-muted">
                    En {analisis.totalVentas} {analisis.totalVentas === 1 ? 'venta' : 'ventas'}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 rounded-xl border border-lz-border bg-lz-linen/70 p-3">
                  <dt className="text-xs text-lz-charcoal-muted">Total vendido</dt>
                  <dd className="font-lz-display text-lg font-bold tabular-nums text-lz-sage">
                    {formatCurrency(analisis.totalValor)}
                  </dd>
                  <span className="text-[11px] text-lz-charcoal-muted">
                    Prom. {analisis.promedioUnidadesPorDiaActivo} und./día activo
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 rounded-xl border border-lz-sage-tint bg-lz-sage-light/70 p-3">
                  <dt className="text-xs font-semibold text-lz-sage-dark">Día que más se vende</dt>
                  <dd className="font-lz-display text-base font-bold text-lz-charcoal sm:text-lg">
                    {analisis.mejorDiaSemana ? analisis.mejorDiaSemana.diaSemana : '-'}
                  </dd>
                  {analisis.mejorDiaSemana && (
                    <span className="font-lz-display text-xs font-semibold tabular-nums text-lz-sage-dark">
                      {analisis.mejorDiaSemana.cantidad} und. ({formatCurrency(analisis.mejorDiaSemana.valor)})
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-0.5 rounded-xl border border-lz-sage-tint bg-lz-sage-light/70 p-3">
                  <dt className="text-xs font-semibold text-lz-sage-dark">Hora pico del producto</dt>
                  <dd className="font-lz-display text-sm font-bold text-lz-charcoal sm:text-base">
                    {analisis.mejorHora ? analisis.mejorHora.etiqueta : '-'}
                  </dd>
                  {analisis.mejorHora && (
                    <span className="font-lz-display text-xs font-semibold tabular-nums text-lz-sage-dark">
                      {analisis.mejorHora.cantidad} und. ({formatCurrency(analisis.mejorHora.valor)})
                    </span>
                  )}
                </div>
              </dl>

              {/* Dos columnas en escritorio / apiladas en móvil: Días de la semana y Horas del día */}
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                {/* 1. ¿Qué días se vende más? */}
                <div className="flex flex-col gap-2.5 rounded-xl border border-lz-border bg-lz-linen/40 p-3.5">
                  <h4 className="font-lz-display text-sm font-bold text-lz-charcoal">
                    ¿Qué días de la semana se vende más {productoActivo.nombre}?
                  </h4>
                  <div className="flex flex-col gap-2">
                    {analisis.porDiaSemana.map((d) => {
                      const esMejor =
                        analisis.mejorDiaSemana?.diaSemana === d.diaSemana && d.cantidad > 0;
                      const pct = Math.round((d.cantidad / maxDiaSemana) * 100);
                      return (
                        <div key={d.diaSemana} className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between text-xs">
                            <span
                              className={`font-semibold ${
                                esMejor ? 'text-lz-sage-dark' : 'text-lz-charcoal'
                              }`}
                            >
                              {d.diaSemana}
                              {esMejor && (
                                <span className="ml-1.5 rounded bg-lz-sage px-1.5 py-0.5 text-[10px] font-bold text-lz-surface">
                                  Mayor venta
                                </span>
                              )}
                            </span>
                            <span className="font-lz-display tabular-nums text-lz-charcoal">
                              <strong>{d.cantidad} und.</strong> · {formatCurrency(d.valor)} (
                              {d.porcentajeUnidades}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-lz-oat">
                            <div
                              className={`h-full rounded-full transition-all ${
                                esMejor ? 'bg-lz-sage' : 'bg-lz-sage-medium'
                              }`}
                              style={{ width: `${d.cantidad > 0 ? Math.max(pct, 5) : 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. ¿Cómo se comporta en el día por horas? */}
                <div className="flex flex-col gap-2.5 rounded-xl border border-lz-border bg-lz-linen/40 p-3.5">
                  <h4 className="font-lz-display text-sm font-bold text-lz-charcoal">
                    ¿Cómo se comporta en el día (por horas)?
                  </h4>
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                    {analisis.porHora.map((h) => {
                      const esMejor = analisis.mejorHora?.hora === h.hora && h.cantidad > 0;
                      const pct = Math.round((h.cantidad / maxHora) * 100);
                      return (
                        <div key={h.hora} className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between text-xs">
                            <span
                              className={`font-semibold ${
                                esMejor ? 'text-lz-sage-dark' : 'text-lz-charcoal'
                              }`}
                            >
                              {h.etiqueta}
                              {esMejor && (
                                <span className="ml-1.5 rounded bg-lz-sage px-1.5 py-0.5 text-[10px] font-bold text-lz-surface">
                                  Hora pico
                                </span>
                              )}
                            </span>
                            <span className="font-lz-display tabular-nums text-lz-charcoal">
                              <strong>{h.cantidad} und.</strong> · {formatCurrency(h.valor)} (
                              {h.porcentajeUnidades}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-lz-oat">
                            <div
                              className={`h-full rounded-full transition-all ${
                                esMejor ? 'bg-lz-sage' : 'bg-lz-sage-medium'
                              }`}
                              style={{ width: `${h.cantidad > 0 ? Math.max(pct, 5) : 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 3. Historial por fecha (cuando el rango abarca varios días) */}
              {analisis.porFecha.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border border-lz-border bg-lz-linen/40 p-3.5">
                  <h4 className="font-lz-display text-sm font-bold text-lz-charcoal">
                    Ventas por fecha de {productoActivo.nombre} ({analisis.porFecha.length}{' '}
                    {analisis.porFecha.length === 1 ? 'día' : 'días'})
                  </h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {analisis.porFecha.slice(0, 18).map((f) => (
                      <div
                        key={f.dia}
                        className="flex items-center justify-between rounded-lg border border-lz-border bg-lz-surface px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="font-bold text-lz-charcoal">{f.diaSemana}</span>{' '}
                          <span className="text-lz-charcoal-muted">({formatearFechaCorta(f.dia)})</span>
                        </div>
                        <div className="text-right font-lz-display tabular-nums">
                          <span className="font-bold text-lz-charcoal">{f.cantidad} und.</span> ·{' '}
                          <span className="font-semibold text-lz-sage">{formatCurrency(f.valor)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : null}
      </section>

      {/* Tabla general de todos los productos vendidos en el rango */}
      {tablas.map((t) => (
        <TablaReporte
          key={t.titulo}
          tabla={t}
          onSeleccionar={seleccionarDesdeTabla}
          seleccionada={indiceFilaSeleccionada}
          etiquetaSeleccionar="Analizar"
        />
      ))}
    </div>
  );
}

export default SeccionProductos;
