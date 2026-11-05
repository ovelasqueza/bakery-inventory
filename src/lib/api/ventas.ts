// Catálogo de Caja, registro, consulta y anulación de ventas.
import { supabase } from '@/lib/supabase';
import type { ProductoCaja } from '@/lib/caja/busqueda';
import { ErrorApp, llamarRpc, traducirError } from './errores';

const TIEMPO_LIMITE_MS = 15_000;
const BUCKET_FOTOS = 'productos';

function sinConexion(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type CategoriaCaja = { id: string; nombre: string };

export type CatalogoCaja = {
  productos: ProductoCaja[];
  /** Categorías que tienen al menos un producto del catálogo, ordenadas por nombre. */
  categorias: CategoriaCaja[];
};

export type TipoVenta = 'productos' | 'valor';

export type LineaVenta = { productoId: string; cantidad: number; precio: number };

export type EntradaVenta = {
  clave: string;
  turnoId: string;
  metodoPagoId: string;
  lineas: LineaVenta[];
  /** Efectivo recibido; null si el método no es efectivo. */
  recibido: number | null;
};

export type EntradaVentaValor = {
  clave: string;
  turnoId: string;
  metodoPagoId: string;
  /** Valores en el orden de la Lista_Valores (enteros positivos). */
  valores: number[];
  /** Efectivo recibido; null si el método no es efectivo. */
  recibido: number | null;
};

export type VentaRegistrada = {
  ventaId: string;
  total: number;
  efectivoRecibido: number;
  cambio: number;
  esEfectivo: boolean;
  creadoEn: string;
};

export type EstadoVenta = 'registrada' | 'anulada';

export type VentaTurno = {
  id: string;
  creadoEn: string;
  total: number;
  metodoPagoId: string;
  metodoNombre: string | null;
  esEfectivo: boolean;
  efectivoRecibido: number;
  cambio: number;
  estado: EstadoVenta;
  anuladaEn: string | null;
  anuladaPor: string | null;
  motivoAnulacion: string | null;
  tipo: TipoVenta;
};

export type EntradaAnulacion = {
  ventaId: string;
  clave: string;
  motivo: string;
  persona: string;
};

export type VentaAnulada = {
  id: string;
  total: number;
  metodoPagoId: string;
  esEfectivo: boolean;
  estado: EstadoVenta;
  anuladaEn: string | null;
  anuladaPor: string | null;
  motivoAnulacion: string | null;
};

export type ResultadoAnulacion =
  | { resultado: 'anulada'; venta: VentaAnulada }
  | { resultado: 'ya_anulada'; anuladaPor: string | null; anuladaEn: string | null; motivo: string | null };

export type VentaDetallada = {
  id: string;
  creadoEn: string;
  total: number;
  metodoPagoId: string;
  esEfectivo: boolean;
  efectivoRecibido: number;
  cambio: number;
  estado: EstadoVenta;
  anuladaEn: string | null;
  anuladaPor: string | null;
  motivoAnulacion: string | null;
  turnoId: string;
  tipo: TipoVenta;
};

export type DetalleLinea = {
  productoId: string | null;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
};

export type DetalleVenta = { venta: VentaDetallada; detalles: DetalleLinea[] };

// ---------------------------------------------------------------------------
// Formas crudas (snake_case) de las consultas y RPC
// ---------------------------------------------------------------------------

type CategoriaEmbebida = { id: string; nombre: string } | { id: string; nombre: string }[] | null;

type FilaCatalogo = {
  id: string;
  nombre: string;
  precio_venta: number | string;
  categoria_id: string | null;
  imagen_path: string | null;
  orden_caja: number | null;
  categorias: CategoriaEmbebida;
};

type MetodoEmbebido = { nombre: string } | { nombre: string }[] | null;

type FilaVenta = {
  id: string;
  creado_en: string;
  total: number;
  metodo_pago_id: string;
  es_efectivo: boolean;
  efectivo_recibido: number;
  cambio: number;
  estado: EstadoVenta;
  anulada_en: string | null;
  anulada_por: string | null;
  motivo_anulacion: string | null;
  tipo?: TipoVenta | null;
  metodos_pago: MetodoEmbebido;
};

type RegistrarVentaCrudo = {
  venta_id: string;
  total: number;
  efectivo_recibido: number;
  cambio: number;
  es_efectivo: boolean;
  creado_en: string;
};

type VentaAnuladaCruda = {
  id: string;
  total: number;
  metodo_pago_id: string;
  es_efectivo: boolean;
  estado: EstadoVenta;
  anulada_en: string | null;
  anulada_por: string | null;
  motivo_anulacion: string | null;
};

type AnularVentaCrudo =
  | { resultado: 'anulada'; venta: VentaAnuladaCruda }
  | { resultado: 'ya_anulada'; anulada_por: string | null; anulada_en: string | null; motivo: string | null };

type DetalleVentaCrudo = {
  venta: {
    id: string;
    creado_en: string;
    total: number;
    metodo_pago_id: string;
    es_efectivo: boolean;
    efectivo_recibido: number;
    cambio: number;
    estado: EstadoVenta;
    anulada_en: string | null;
    anulada_por: string | null;
    motivo_anulacion: string | null;
    turno_id: string;
    tipo?: TipoVenta | null;
  };
  detalles: {
    producto_id: string | null;
    nombre_producto: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  }[];
};

function primero<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function urlFoto(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Catálogo vendible en una sola consulta (activo, no materia prima, visible en Caja y con
 * precio de venta). Devuelve todo o lanza `ErrorApp`; nunca una lista parcial (Req 4.10).
 * La Caja cobra `precio_venta`; `precio_actual` es el costo del inventario.
 */
export async function obtenerCatalogoCaja(): Promise<CatalogoCaja> {
  if (sinConexion()) throw new ErrorApp('SIN_CONEXION');

  let respuesta;
  try {
    respuesta = await supabase
      .from('productos')
      .select('id,nombre,precio_venta,categoria_id,imagen_path,orden_caja,categorias(id,nombre)')
      .eq('activo', true)
      .neq('tipo_producto', 'materia_prima')
      .eq('visible_caja', true)
      .not('precio_venta', 'is', null)
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  } catch (e) {
    throw traducirError(e);
  }
  const { data, error, status } = respuesta;
  if (error) throw traducirError(error, status);

  const filas = (data ?? []) as unknown as FilaCatalogo[];
  const categorias = new Map<string, CategoriaCaja>();
  const productos = filas.map((f): ProductoCaja => {
    const cat = primero(f.categorias);
    if (cat && f.categoria_id) categorias.set(cat.id, { id: cat.id, nombre: cat.nombre });
    return {
      id: f.id,
      nombre: f.nombre,
      precio: Math.round(Number(f.precio_venta)),
      categoriaId: f.categoria_id,
      imagenUrl: urlFoto(f.imagen_path),
      orden: f.orden_caja,
    };
  });

  return {
    productos,
    categorias: Array.from(categorias.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  };
}

/** Registra la venta de forma atómica e idempotente por `clave` (Req 6.8, 6.12). */
export async function registrarVenta(entrada: EntradaVenta): Promise<VentaRegistrada> {
  const r = await llamarRpc<RegistrarVentaCrudo>('registrar_venta', {
    p_clave: entrada.clave,
    p_turno: entrada.turnoId,
    p_metodo: entrada.metodoPagoId,
    p_lineas: entrada.lineas.map((l) => ({
      producto_id: l.productoId,
      cantidad: l.cantidad,
      precio: l.precio,
    })),
    p_recibido: entrada.recibido,
  });
  return mapearVentaRegistrada(r);
}

/**
 * Registra una venta por valor (sin productos) de forma atómica e idempotente por clave
 * (Req 5.4). El total lo calcula el servidor como la suma de los valores.
 */
export async function registrarVentaValor(entrada: EntradaVentaValor): Promise<VentaRegistrada> {
  const r = await llamarRpc<RegistrarVentaCrudo>('registrar_venta_valor', {
    p_clave: entrada.clave,
    p_turno: entrada.turnoId,
    p_metodo: entrada.metodoPagoId,
    p_valores: entrada.valores,
    p_recibido: entrada.recibido,
  });
  return mapearVentaRegistrada(r);
}

function mapearVentaRegistrada(r: RegistrarVentaCrudo): VentaRegistrada {
  return {
    ventaId: r.venta_id,
    total: r.total,
    efectivoRecibido: r.efectivo_recibido,
    cambio: r.cambio,
    esEfectivo: r.es_efectivo,
    creadoEn: r.creado_en,
  };
}

/** Ventas del turno, de la más reciente a la más antigua, con el nombre del método (Req 7.1). */
export async function ventasDelTurno(turnoId: string): Promise<VentaTurno[]> {
  if (sinConexion()) throw new ErrorApp('SIN_CONEXION');

  let respuesta;
  try {
    respuesta = await supabase
      .from('ventas')
      .select(
        'id,creado_en,total,metodo_pago_id,es_efectivo,efectivo_recibido,cambio,estado,' +
          'anulada_en,anulada_por,motivo_anulacion,tipo,metodos_pago(nombre)'
      )
      .eq('turno_id', turnoId)
      .order('creado_en', { ascending: false })
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  } catch (e) {
    throw traducirError(e);
  }
  const { data, error, status } = respuesta;
  if (error) throw traducirError(error, status);

  return ((data ?? []) as unknown as FilaVenta[]).map((v) => ({
    id: v.id,
    creadoEn: v.creado_en,
    total: v.total,
    metodoPagoId: v.metodo_pago_id,
    metodoNombre: primero(v.metodos_pago)?.nombre ?? null,
    esEfectivo: v.es_efectivo,
    efectivoRecibido: v.efectivo_recibido,
    cambio: v.cambio,
    estado: v.estado,
    anuladaEn: v.anulada_en,
    anuladaPor: v.anulada_por,
    motivoAnulacion: v.motivo_anulacion,
    tipo: v.tipo ?? 'productos',
  }));
}

/** Anula una venta del turno abierto; idempotente por `clave` (Req 7.2, 7.7, 7.8). */
export async function anularVenta(entrada: EntradaAnulacion): Promise<ResultadoAnulacion> {
  const r = await llamarRpc<AnularVentaCrudo>('anular_venta', {
    p_venta: entrada.ventaId,
    p_clave: entrada.clave,
    p_motivo: entrada.motivo,
    p_persona: entrada.persona,
  });
  if (r.resultado === 'ya_anulada') {
    return {
      resultado: 'ya_anulada',
      anuladaPor: r.anulada_por,
      anuladaEn: r.anulada_en,
      motivo: r.motivo,
    };
  }
  const v = r.venta;
  return {
    resultado: 'anulada',
    venta: {
      id: v.id,
      total: v.total,
      metodoPagoId: v.metodo_pago_id,
      esEfectivo: v.es_efectivo,
      estado: v.estado,
      anuladaEn: v.anulada_en,
      anuladaPor: v.anulada_por,
      motivoAnulacion: v.motivo_anulacion,
    },
  };
}

/** Cabecera y líneas de una venta. */
export async function detalleVenta(ventaId: string): Promise<DetalleVenta> {
  const r = await llamarRpc<DetalleVentaCrudo>('detalle_venta', { p_venta: ventaId });
  const v = r.venta;
  return {
    venta: {
      id: v.id,
      creadoEn: v.creado_en,
      total: v.total,
      metodoPagoId: v.metodo_pago_id,
      esEfectivo: v.es_efectivo,
      efectivoRecibido: v.efectivo_recibido,
      cambio: v.cambio,
      estado: v.estado,
      anuladaEn: v.anulada_en,
      anuladaPor: v.anulada_por,
      motivoAnulacion: v.motivo_anulacion,
      turnoId: v.turno_id,
      tipo: v.tipo ?? 'productos',
    },
    detalles: (r.detalles ?? []).map((d) => ({
      productoId: d.producto_id,
      nombreProducto: d.nombre_producto,
      cantidad: d.cantidad,
      precioUnitario: d.precio_unitario,
      subtotal: d.subtotal,
    })),
  };
}
