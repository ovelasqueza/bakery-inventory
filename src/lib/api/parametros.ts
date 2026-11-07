import { supabase } from '@/lib/supabase';
import { ErrorApp, traducirError } from '@/lib/api/errores';
import { normalizarTexto, type PromocionProducto } from '@/lib/caja/busqueda';

// ============================================
// Parámetros de la Caja (Req 2.2, 2.3, 6.2, 14.1–14.8, 14.12, 14.13)
// Las tablas de parámetros no se borran: solo se desactivan (Req 14.8).
// ============================================

const TIEMPO_LIMITE_MS = 15_000;
const BASE_MAXIMA = 10_000_000;

export type MetodoPagoParam = {
  id: string;
  nombre: string;
  esEfectivo: boolean;
  activo: boolean;
  orden: number;
};

export type CategoriaGastoParam = { id: string; nombre: string; activo: boolean };
export type PersonaCajaParam = { id: string; nombre: string; activo: boolean };
export type CategoriaProducto = { id: string; nombre: string };
export type CategoriaProductoParam = { id: string; nombre: string; activo: boolean };

export type ParametrosCaja = {
  metodosPago: MetodoPagoParam[];
  categoriasGasto: CategoriaGastoParam[];
  personas: PersonaCajaParam[];
  categoriasProducto: CategoriaProducto[];
  baseCajaDefecto: number;
  cajonAlCobrar: boolean;
  cajonEnTurno: boolean;
};

export type PromocionConfigurable = {
  activo: boolean;
  cantidad: number;
  precio: number;
};

export type ProductoConfigurable = {
  id: string;
  nombre: string;
  activo: boolean;
  /** Precio de venta al público (null = no se vende en Caja). */
  precioVenta: number | null;
  categoriaId: string | null;
  visibleCaja: boolean;
  ordenCaja: number;
  imagenPath: string | null;
  /** Si está activo, muestra el botón superior izquierdo ($ / und) en Caja para abrir el popup. */
  ventaPorMonto: boolean;
  /** Promoción parametrizable para este producto (ej. 8 unidades por $ 3.000). */
  promocion: PromocionConfigurable;
};

export type ClaveConfigCaja = 'base_caja_defecto' | 'cajon_al_cobrar' | 'cajon_en_turno';

// ---- Ayudantes ----

type Respuesta = { data: unknown; error: unknown; status?: number };

function sinConexion(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Ejecuta una consulta con tiempo límite de 15 s. Sin conexión no llama al servidor;
 * los errores se traducen con `traducirError` (23505 → NOMBRE_REPETIDO, trigger → SIN_METODO_EFECTIVO).
 */
async function consultar<T>(construir: (senal: AbortSignal) => PromiseLike<Respuesta>): Promise<T> {
  if (sinConexion()) throw new ErrorApp('SIN_CONEXION');
  let respuesta: Respuesta;
  try {
    respuesta = await construir(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  } catch (e) {
    throw traducirError(e);
  }
  if (respuesta.error) throw traducirError(respuesta.error, respuesta.status);
  return respuesta.data as T;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

type FilaMetodo = { id: string; nombre: string; es_efectivo: boolean; activo: boolean; orden: number };
type FilaSimple = { id: string; nombre: string; activo: boolean };
type FilaProducto = {
  id: string;
  nombre: string;
  activo: boolean;
  precio_venta: number | string | null;
  categoria_id: string | null;
  visible_caja: boolean | null;
  orden_caja: number | null;
  imagen_path: string | null;
};

const COLUMNAS_METODO = 'id, nombre, es_efectivo, activo, orden';
const COLUMNAS_SIMPLE = 'id, nombre, activo';
const COLUMNAS_PRODUCTO =
  'id, nombre, activo, precio_venta, categoria_id, visible_caja, orden_caja, imagen_path';

function aMetodo(f: FilaMetodo): MetodoPagoParam {
  return { id: f.id, nombre: f.nombre, esEfectivo: f.es_efectivo, activo: f.activo, orden: f.orden };
}

function aSimple(f: FilaSimple): { id: string; nombre: string; activo: boolean } {
  return { id: f.id, nombre: f.nombre, activo: f.activo };
}

function promocionPorDefecto(nombre: string, precioVenta: number | null): PromocionConfigurable {
  if (normalizarTexto(nombre) === 'pan de 400' || precioVenta === 400) {
    return {
      activo: normalizarTexto(nombre) === 'pan de 400',
      cantidad: 8,
      precio: 3000,
    };
  }
  const p = precioVenta && precioVenta > 0 ? precioVenta : 500;
  return {
    activo: false,
    cantidad: 5,
    precio: p * 5,
  };
}

function aProducto(
  f: FilaProducto,
  ventaPorMonto = false,
  promocion?: PromocionConfigurable,
): ProductoConfigurable {
  const precioVenta =
    f.precio_venta === null || f.precio_venta === undefined ? null : Number(f.precio_venta);
  return {
    id: f.id,
    nombre: f.nombre,
    activo: f.activo,
    precioVenta,
    categoriaId: f.categoria_id ?? null,
    // Sin configuración: visible con orden 0 (Req 14.6)
    visibleCaja: f.visible_caja ?? true,
    ordenCaja: f.orden_caja ?? 0,
    imagenPath: f.imagen_path ?? null,
    ventaPorMonto,
    promocion: promocion ?? promocionPorDefecto(f.nombre, precioVenta),
  };
}

function leerBase(valor: string | undefined): number {
  if (valor === undefined || !/^\d+$/.test(valor.trim())) return 0;
  const n = Number(valor.trim());
  return Number.isSafeInteger(n) && n <= BASE_MAXIMA ? n : 0;
}

function leerBooleano(valor: string | undefined): boolean {
  const v = (valor ?? '').trim().toLowerCase();
  if (v === 'false') return false;
  return true; // ausente o inválido: activado por defecto (Req 14.7)
}

// ---- Carga para la Caja ----

/** Parámetros activos que usa la pantalla de Caja en cada carga (Req 2.2, 2.3, 6.2, 14.8, 14.10). */
export async function obtenerParametrosCaja(): Promise<ParametrosCaja> {
  const [metodos, categoriasGasto, personas, categoriasProducto, config] = await Promise.all([
    consultar<FilaMetodo[]>((s) =>
      supabase
        .from('metodos_pago')
        .select(COLUMNAS_METODO)
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })
        .abortSignal(s),
    ),
    consultar<FilaSimple[]>((s) =>
      supabase
        .from('categorias_gasto')
        .select(COLUMNAS_SIMPLE)
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .abortSignal(s),
    ),
    consultar<FilaSimple[]>((s) =>
      supabase
        .from('personas_caja')
        .select(COLUMNAS_SIMPLE)
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .abortSignal(s),
    ),
    listarCategorias(),
    consultar<{ clave: string; valor: string | null }[]>((s) =>
      supabase
        .from('configuracion')
        .select('clave, valor')
        .in('clave', ['base_caja_defecto', 'cajon_al_cobrar', 'cajon_en_turno'])
        .abortSignal(s),
    ),
  ]);

  const valores = new Map((config ?? []).map((f) => [f.clave, texto(f.valor)]));

  return {
    metodosPago: (metodos ?? []).map(aMetodo),
    categoriasGasto: (categoriasGasto ?? []).map(aSimple),
    personas: (personas ?? []).map(aSimple),
    categoriasProducto,
    baseCajaDefecto: leerBase(valores.get('base_caja_defecto')),
    cajonAlCobrar: leerBooleano(valores.get('cajon_al_cobrar')),
    cajonEnTurno: leerBooleano(valores.get('cajon_en_turno')),
  };
}

// ---- Métodos de pago (Req 14.1, 14.2) ----

export async function listarMetodosPago(): Promise<MetodoPagoParam[]> {
  const filas = await consultar<FilaMetodo[]>((s) =>
    supabase
      .from('metodos_pago')
      .select(COLUMNAS_METODO)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })
      .abortSignal(s),
  );
  return (filas ?? []).map(aMetodo);
}

export async function crearMetodoPago(datos: {
  nombre: string;
  esEfectivo: boolean;
  orden: number;
  activo?: boolean;
}): Promise<MetodoPagoParam> {
  const fila = await consultar<FilaMetodo>((s) =>
    supabase
      .from('metodos_pago')
      .insert({
        nombre: datos.nombre.trim(),
        es_efectivo: datos.esEfectivo,
        orden: datos.orden,
        activo: datos.activo ?? true,
      })
      .select(COLUMNAS_METODO)
      .abortSignal(s)
      .single(),
  );
  return aMetodo(fila);
}

/** El trigger de la BD rechaza dejar sin método de efectivo activo → `SIN_METODO_EFECTIVO`. */
export async function actualizarMetodoPago(
  id: string,
  cambios: { nombre?: string; activo?: boolean; esEfectivo?: boolean; orden?: number },
): Promise<MetodoPagoParam> {
  const fila: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) fila.nombre = cambios.nombre.trim();
  if (cambios.activo !== undefined) fila.activo = cambios.activo;
  if (cambios.esEfectivo !== undefined) fila.es_efectivo = cambios.esEfectivo;
  if (cambios.orden !== undefined) fila.orden = cambios.orden;

  const resultado = await consultar<FilaMetodo>((s) =>
    supabase.from('metodos_pago').update(fila).eq('id', id).select(COLUMNAS_METODO).abortSignal(s).single(),
  );
  return aMetodo(resultado);
}

// ---- Categorías de gasto y personas de caja (Req 14.3, 14.4) ----

type TablaSimple = 'categorias_gasto' | 'personas_caja';

async function listarSimple(tabla: TablaSimple): Promise<FilaSimple[]> {
  const filas = await consultar<FilaSimple[]>((s) =>
    supabase.from(tabla).select(COLUMNAS_SIMPLE).order('nombre', { ascending: true }).abortSignal(s),
  );
  return (filas ?? []).map(aSimple);
}

async function crearSimple(tabla: TablaSimple, nombre: string, activo = true): Promise<FilaSimple> {
  const fila = await consultar<FilaSimple>((s) =>
    supabase
      .from(tabla)
      .insert({ nombre: nombre.trim(), activo })
      .select(COLUMNAS_SIMPLE)
      .abortSignal(s)
      .single(),
  );
  return aSimple(fila);
}

async function actualizarSimple(
  tabla: TablaSimple,
  id: string,
  cambios: { nombre?: string; activo?: boolean },
): Promise<FilaSimple> {
  const fila: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) fila.nombre = cambios.nombre.trim();
  if (cambios.activo !== undefined) fila.activo = cambios.activo;

  const resultado = await consultar<FilaSimple>((s) =>
    supabase.from(tabla).update(fila).eq('id', id).select(COLUMNAS_SIMPLE).abortSignal(s).single(),
  );
  return aSimple(resultado);
}

export function listarCategoriasGasto(): Promise<CategoriaGastoParam[]> {
  return listarSimple('categorias_gasto');
}

export function crearCategoriaGasto(nombre: string, activo = true): Promise<CategoriaGastoParam> {
  return crearSimple('categorias_gasto', nombre, activo);
}

export function actualizarCategoriaGasto(
  id: string,
  cambios: { nombre?: string; activo?: boolean },
): Promise<CategoriaGastoParam> {
  return actualizarSimple('categorias_gasto', id, cambios);
}

export function listarPersonasCaja(): Promise<PersonaCajaParam[]> {
  return listarSimple('personas_caja');
}

export function crearPersonaCaja(nombre: string, activo = true): Promise<PersonaCajaParam> {
  return crearSimple('personas_caja', nombre, activo);
}

export function actualizarPersonaCaja(
  id: string,
  cambios: { nombre?: string; activo?: boolean },
): Promise<PersonaCajaParam> {
  return actualizarSimple('personas_caja', id, cambios);
}

// ---- Configuración (Req 14.5, 14.7, 14.12) ----

/**
 * Guarda una clave de `configuracion`: actualiza la fila existente o la crea si falta.
 * Las claves `*_hash` están ocultas por RLS y se rechazan aquí.
 */
export async function guardarConfig(clave: ClaveConfigCaja | string, valor: string): Promise<void> {
  const limpia = clave.trim();
  if (limpia === '' || /_hash$/i.test(limpia)) throw new ErrorApp('DATOS_INVALIDOS');

  const actualizadas = await consultar<{ clave: string }[]>((s) =>
    supabase.from('configuracion').update({ valor }).eq('clave', limpia).select('clave').abortSignal(s),
  );
  if ((actualizadas ?? []).length > 0) return;

  await consultar<null>((s) =>
    supabase.from('configuracion').insert({ clave: limpia, valor }).abortSignal(s),
  );
}

// ---- Productos en Caja (Req 14.6, 14.13) ----

export const CLAVE_PRODUCTOS_VENTA_MONTO = 'productos_venta_por_monto';
export const CLAVE_PRODUCTOS_PROMOCIONES = 'productos_promociones_caja';

export type MapaVentaPorMonto = Record<string, boolean>;
export type MapaPromociones = Record<string, PromocionConfigurable>;

export async function leerMapaVentaPorMonto(): Promise<MapaVentaPorMonto> {
  try {
    const filas = await consultar<{ valor: string | null }[]>((s) =>
      supabase
        .from('configuracion')
        .select('valor')
        .eq('clave', CLAVE_PRODUCTOS_VENTA_MONTO)
        .abortSignal(s),
    );
    const raw = filas?.[0]?.valor;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const mapa: MapaVentaPorMonto = {};
      for (const item of parsed) {
        if (typeof item === 'string') mapa[item] = true;
      }
      return mapa;
    }
    if (parsed && typeof parsed === 'object') {
      const mapa: MapaVentaPorMonto = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'boolean') mapa[k] = v;
      }
      return mapa;
    }
    return {};
  } catch {
    return {};
  }
}

async function guardarMapaVentaPorMonto(mapa: MapaVentaPorMonto): Promise<void> {
  await guardarConfig(CLAVE_PRODUCTOS_VENTA_MONTO, JSON.stringify(mapa));
}

export async function leerMapaPromociones(): Promise<MapaPromociones> {
  try {
    const filas = await consultar<{ valor: string | null }[]>((s) =>
      supabase
        .from('configuracion')
        .select('valor')
        .eq('clave', CLAVE_PRODUCTOS_PROMOCIONES)
        .abortSignal(s),
    );
    const raw = filas?.[0]?.valor;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const mapa: MapaPromociones = {};
    for (const [id, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (val && typeof val === 'object') {
        const obj = val as Record<string, unknown>;
        const cantidad = Number(obj.cantidad);
        const precio = Number(obj.precio);
        const activo = Boolean(obj.activo);
        if (Number.isInteger(cantidad) && cantidad >= 1 && Number.isInteger(precio) && precio >= 1) {
          mapa[id] = { activo, cantidad, precio };
        }
      }
    }
    return mapa;
  } catch {
    return {};
  }
}

async function guardarMapaPromociones(mapa: MapaPromociones): Promise<void> {
  await guardarConfig(CLAVE_PRODUCTOS_PROMOCIONES, JSON.stringify(mapa));
}

export function resolverVentaPorMonto(
  id: string,
  nombre: string,
  mapa: MapaVentaPorMonto,
): boolean {
  if (id in mapa) return mapa[id];
  return normalizarTexto(nombre) === 'pan de 400';
}

export function resolverPromocionConfigurable(
  id: string,
  nombre: string,
  precioVenta: number | null,
  mapa: MapaPromociones,
): PromocionConfigurable {
  if (id in mapa) return mapa[id];
  return promocionPorDefecto(nombre, precioVenta);
}

export function resolverPromocionActiva(
  id: string,
  nombre: string,
  precioVenta: number | null,
  mapa: MapaPromociones,
): PromocionProducto | null {
  const cfg = resolverPromocionConfigurable(id, nombre, precioVenta, mapa);
  if (!cfg.activo || cfg.cantidad < 1 || cfg.precio < 1) return null;
  return { cantidad: cfg.cantidad, precio: cfg.precio };
}

/** Todos los productos que no son materia prima, activos o no. */
export async function productosConfigurables(): Promise<ProductoConfigurable[]> {
  const [filas, mapaMonto, mapaPromos] = await Promise.all([
    consultar<FilaProducto[]>((s) =>
      supabase
        .from('productos')
        .select(COLUMNAS_PRODUCTO)
        // tipo_producto NULL en filas antiguas cuenta como 'normal'
        .or('tipo_producto.is.null,tipo_producto.neq.materia_prima')
        .order('orden_caja', { ascending: true })
        .order('nombre', { ascending: true })
        .abortSignal(s),
    ),
    leerMapaVentaPorMonto(),
    leerMapaPromociones(),
  ]);
  return (filas ?? []).map((f) => {
    const pv = f.precio_venta === null || f.precio_venta === undefined ? null : Number(f.precio_venta);
    return aProducto(
      f,
      resolverVentaPorMonto(f.id, f.nombre, mapaMonto),
      resolverPromocionConfigurable(f.id, f.nombre, pv, mapaPromos),
    );
  });
}

export async function actualizarProductoCaja(
  id: string,
  cambios: {
    visibleCaja?: boolean;
    ordenCaja?: number;
    categoriaId?: string | null;
    ventaPorMonto?: boolean;
    promocion?: PromocionConfigurable;
  },
): Promise<ProductoConfigurable> {
  const [mapaMonto, mapaPromos] = await Promise.all([
    leerMapaVentaPorMonto(),
    leerMapaPromociones(),
  ]);

  if (cambios.ventaPorMonto !== undefined) {
    mapaMonto[id] = cambios.ventaPorMonto;
    await guardarMapaVentaPorMonto(mapaMonto);
  }

  if (cambios.promocion !== undefined) {
    mapaPromos[id] = {
      activo: Boolean(cambios.promocion.activo),
      cantidad: Math.max(1, Math.round(cambios.promocion.cantidad)),
      precio: Math.max(1, Math.round(cambios.promocion.precio)),
    };
    await guardarMapaPromociones(mapaPromos);
  }

  const fila: Record<string, unknown> = {};
  if (cambios.visibleCaja !== undefined) fila.visible_caja = cambios.visibleCaja;
  if (cambios.ordenCaja !== undefined) fila.orden_caja = cambios.ordenCaja;
  if (cambios.categoriaId !== undefined) fila.categoria_id = cambios.categoriaId;

  const resultado =
    Object.keys(fila).length === 0
      ? await consultar<FilaProducto>((s) =>
          supabase
            .from('productos')
            .select(COLUMNAS_PRODUCTO)
            .eq('id', id)
            .abortSignal(s)
            .single(),
        )
      : await consultar<FilaProducto>((s) =>
          supabase
            .from('productos')
            .update(fila)
            .eq('id', id)
            .or('tipo_producto.is.null,tipo_producto.neq.materia_prima')
            .select(COLUMNAS_PRODUCTO)
            .abortSignal(s)
            .single(),
        );

  const pv =
    resultado.precio_venta === null || resultado.precio_venta === undefined
      ? null
      : Number(resultado.precio_venta);
  return aProducto(
    resultado,
    resolverVentaPorMonto(id, resultado.nombre, mapaMonto),
    resolverPromocionConfigurable(id, resultado.nombre, pv, mapaPromos),
  );
}

const CLAVE_CATEGORIAS_INACTIVAS = 'categorias_producto_inactivas';

type FilaCategoriaProducto = { id: string; nombre: string; activo?: boolean | null };

async function leerIdsCategoriasInactivas(): Promise<Set<string>> {
  const filas = await consultar<{ valor: string | null }[]>((s) =>
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', CLAVE_CATEGORIAS_INACTIVAS)
      .abortSignal(s),
  );
  const raw = filas?.[0]?.valor;
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

async function guardarIdsCategoriasInactivas(ids: Set<string>): Promise<void> {
  await guardarConfig(CLAVE_CATEGORIAS_INACTIVAS, JSON.stringify(Array.from(ids)));
}

/** Todas las categorías de producto (activas e inactivas) para Configuración. */
export async function listarCategoriasProducto(): Promise<CategoriaProductoParam[]> {
  const [filas, inactivas] = await Promise.all([
    consultar<FilaCategoriaProducto[]>((s) =>
      supabase.from('categorias').select('*').order('nombre', { ascending: true }).abortSignal(s),
    ),
    leerIdsCategoriasInactivas(),
  ]);
  return (filas ?? []).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    activo: typeof f.activo === 'boolean' ? f.activo && !inactivas.has(f.id) : !inactivas.has(f.id),
  }));
}

/** Categorías de producto activas (para selector de productos y Caja). */
export async function listarCategorias(): Promise<CategoriaProducto[]> {
  const todas = await listarCategoriasProducto();
  return todas.filter((c) => c.activo).map((c) => ({ id: c.id, nombre: c.nombre }));
}

export async function crearCategoriaProducto(
  nombre: string,
  activo = true,
): Promise<CategoriaProductoParam> {
  const limpio = nombre.trim();
  const fila = await consultar<FilaCategoriaProducto>((s) =>
    supabase.from('categorias').insert({ nombre: limpio }).select('*').abortSignal(s).single(),
  );
  if (!activo) {
    return actualizarCategoriaProducto(fila.id, { activo: false });
  }
  return { id: fila.id, nombre: fila.nombre, activo: true };
}

/**
 * Actualiza el nombre o el estado activo de una categoría de producto.
 * Si se desactiva (`activo === false`), deja sin categoría (`categoria_id = null`)
 * todos los productos que la tuvieran asignada.
 */
export async function actualizarCategoriaProducto(
  id: string,
  cambios: { nombre?: string; activo?: boolean },
): Promise<CategoriaProductoParam> {
  if (cambios.activo === false) {
    await consultar((s) =>
      supabase.from('productos').update({ categoria_id: null }).eq('categoria_id', id).abortSignal(s),
    );
  }

  const inactivas = await leerIdsCategoriasInactivas();
  const teniaEnRespaldo = inactivas.has(id);
  if (cambios.activo !== undefined) {
    if (cambios.activo) inactivas.delete(id);
    else inactivas.add(id);
  }

  let fila: FilaCategoriaProducto;
  const tieneColumnaActivo = async (): Promise<FilaCategoriaProducto | null> => {
    const datos: Record<string, unknown> = {};
    if (cambios.nombre !== undefined) datos.nombre = cambios.nombre.trim();
    if (cambios.activo !== undefined) datos.activo = cambios.activo;
    if (Object.keys(datos).length === 0) return null;
    if (sinConexion()) throw new ErrorApp('SIN_CONEXION');
    const res = await supabase
      .from('categorias')
      .update(datos)
      .eq('id', id)
      .select('*')
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS))
      .single();
    if (res.error) {
      const msg = String((res.error as { message?: string }).message ?? '');
      if (cambios.activo !== undefined && /activo/i.test(msg)) {
        return null; // La migración `migration-categorias.sql` aún no se ha ejecutado; usar respaldo
      }
      throw traducirError(res.error, res.status);
    }
    return res.data as FilaCategoriaProducto;
  };

  const actualizadaConColumna = await tieneColumnaActivo();
  if (actualizadaConColumna) {
    fila = actualizadaConColumna;
    if (cambios.activo !== undefined && teniaEnRespaldo) {
      await guardarIdsCategoriasInactivas(inactivas);
    }
  } else {
    if (cambios.nombre !== undefined) {
      fila = await consultar<FilaCategoriaProducto>((s) =>
        supabase
          .from('categorias')
          .update({ nombre: cambios.nombre!.trim() })
          .eq('id', id)
          .select('*')
          .abortSignal(s)
          .single(),
      );
    } else {
      fila = await consultar<FilaCategoriaProducto>((s) =>
        supabase.from('categorias').select('*').eq('id', id).abortSignal(s).single(),
      );
    }
    if (cambios.activo !== undefined) {
      await guardarIdsCategoriasInactivas(inactivas);
    }
  }

  const activoFinal =
    cambios.activo !== undefined
      ? cambios.activo
      : typeof fila.activo === 'boolean'
        ? fila.activo && !inactivas.has(fila.id)
        : !inactivas.has(fila.id);

  return { id: fila.id, nombre: fila.nombre, activo: activoFinal };
}
