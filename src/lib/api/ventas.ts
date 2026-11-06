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
  /** Valores adicionales de la calculadora combinados en el mismo pedido. */
  valores?: number[];
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
  clave: string;
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

/** Deriva un segundo UUID determinístico a partir de `uuid` para idempotencia del respaldo combinado. */
export function derivarUuidSecundario(uuid: string): string {
  const ultimo = uuid.slice(-1).toLowerCase();
  const reemplazo = ultimo === '0' ? '1' : '0';
  return `${uuid.slice(0, -1)}${reemplazo}`;
}

/** Registra la venta de forma atómica e idempotente por `clave` (Req 6.8, 6.12). */
export async function registrarVenta(entrada: EntradaVenta): Promise<VentaRegistrada> {
  const valores = entrada.valores ?? [];
  const lineasRpc = entrada.lineas.map((l) => ({
    producto_id: l.productoId,
    cantidad: l.cantidad,
    precio: l.precio,
  }));

  if (valores.length > 0) {
    try {
      const r = await llamarRpc<RegistrarVentaCrudo>('registrar_venta_combinada', {
        p_clave: entrada.clave,
        p_turno: entrada.turnoId,
        p_metodo: entrada.metodoPagoId,
        p_lineas: lineasRpc,
        p_valores: valores,
        p_recibido: entrada.recibido,
      });
      return mapearVentaRegistrada(r);
    } catch (e) {
      // Si la migración SQL de registrar_venta_combinada aún no se ha corrido en Supabase,
      // respaldamos registrando productos y valores con claves idempotentes derivadas.
      if (!(e instanceof ErrorApp) || e.codigo !== 'DESCONOCIDO') {
        throw e;
      }
      const totalProductos = entrada.lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);
      const totalValores = valores.reduce((s, v) => s + v, 0);
      const totalGeneral = totalProductos + totalValores;
      const cambioTotal =
        entrada.recibido !== null ? Math.max(0, entrada.recibido - totalGeneral) : 0;
      const recibidoProductos =
        entrada.recibido !== null ? totalProductos + cambioTotal : null;
      const recibidoValores = entrada.recibido !== null ? totalValores : null;

      const rProd = await llamarRpc<RegistrarVentaCrudo>('registrar_venta', {
        p_clave: entrada.clave,
        p_turno: entrada.turnoId,
        p_metodo: entrada.metodoPagoId,
        p_lineas: lineasRpc,
        p_recibido: recibidoProductos,
      });
      const rVal = await llamarRpc<RegistrarVentaCrudo>('registrar_venta_valor', {
        p_clave: derivarUuidSecundario(entrada.clave),
        p_turno: entrada.turnoId,
        p_metodo: entrada.metodoPagoId,
        p_valores: valores,
        p_recibido: recibidoValores,
      });
      const total = rProd.total + rVal.total;
      const cambio = rProd.cambio + rVal.cambio;
      return {
        ventaId: rProd.venta_id,
        total,
        efectivoRecibido: total + cambio,
        cambio,
        esEfectivo: rProd.es_efectivo,
        creadoEn: rProd.creado_en,
      };
    }
  }

  const r = await llamarRpc<RegistrarVentaCrudo>('registrar_venta', {
    p_clave: entrada.clave,
    p_turno: entrada.turnoId,
    p_metodo: entrada.metodoPagoId,
    p_lineas: lineasRpc,
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
        'id,clave,creado_en,total,metodo_pago_id,es_efectivo,efectivo_recibido,cambio,estado,' +
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

  const filas = (data ?? []) as unknown as FilaVenta[];
  const porClave = new Map<string, FilaVenta>();
  for (const f of filas) {
    if (f.clave) porClave.set(f.clave.toLowerCase(), f);
  }

  const secundariasOcultas = new Set<string>();
  const secundariasPorPrincipal = new Map<string, FilaVenta>();

  for (const f of filas) {
    const tipo = f.tipo ?? 'productos';
    if (tipo === 'productos' && f.clave) {
      const claveSec = derivarUuidSecundario(f.clave).toLowerCase();
      const cand = porClave.get(claveSec);
      if (cand && cand.id !== f.id && (cand.tipo ?? 'productos') === 'valor') {
        secundariasOcultas.add(cand.id);
        secundariasPorPrincipal.set(f.id, cand);
      }
    }
  }

  return filas
    .filter((v) => !secundariasOcultas.has(v.id))
    .map((v) => {
      const sec = secundariasPorPrincipal.get(v.id);
      return {
        id: v.id,
        creadoEn: v.creado_en,
        total: v.total + (sec ? sec.total : 0),
        metodoPagoId: v.metodo_pago_id,
        metodoNombre: primero(v.metodos_pago)?.nombre ?? null,
        esEfectivo: v.es_efectivo,
        efectivoRecibido: v.efectivo_recibido + (sec ? sec.efectivo_recibido : 0),
        cambio: v.cambio + (sec ? sec.cambio : 0),
        estado: v.estado,
        anuladaEn: v.anulada_en,
        anuladaPor: v.anulada_por,
        motivoAnulacion: v.motivo_anulacion,
        tipo: v.tipo ?? 'productos',
      };
    });
}

async function buscarVentaSecundariaCombinada(ventaPrincipalId: string): Promise<string | null> {
  const { data: orig } = await supabase
    .from('ventas')
    .select('clave, tipo')
    .eq('id', ventaPrincipalId)
    .maybeSingle();
  if (!orig?.clave || (orig.tipo ?? 'productos') !== 'productos') return null;

  const claveSec = derivarUuidSecundario(String(orig.clave));
  const { data: sec } = await supabase
    .from('ventas')
    .select('id, tipo')
    .eq('clave', claveSec)
    .maybeSingle();
  if (!sec?.id || sec.tipo !== 'valor') return null;
  return String(sec.id);
}

/** Anula una venta del turno abierto; idempotente por `clave` (Req 7.2, 7.7, 7.8). */
export async function anularVenta(entrada: EntradaAnulacion): Promise<ResultadoAnulacion> {
  const secundariaId = await buscarVentaSecundariaCombinada(entrada.ventaId).catch(() => null);
  const r = await llamarRpc<AnularVentaCrudo>('anular_venta', {
    p_venta: entrada.ventaId,
    p_clave: entrada.clave,
    p_motivo: entrada.motivo,
    p_persona: entrada.persona,
  });

  if (secundariaId) {
    await llamarRpc<AnularVentaCrudo>('anular_venta', {
      p_venta: secundariaId,
      p_clave: derivarUuidSecundario(entrada.clave),
      p_motivo: entrada.motivo,
      p_persona: entrada.persona,
    }).catch(() => undefined);
  }

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
  const [r, secundariaId] = await Promise.all([
    llamarRpc<DetalleVentaCrudo>('detalle_venta', { p_venta: ventaId }),
    buscarVentaSecundariaCombinada(ventaId).catch(() => null),
  ]);

  let rSec: DetalleVentaCrudo | null = null;
  if (secundariaId) {
    rSec = await llamarRpc<DetalleVentaCrudo>('detalle_venta', { p_venta: secundariaId }).catch(() => null);
  }

  const v = r.venta;
  const secV = rSec?.venta;
  const detallesPrincipales = (r.detalles ?? []).map((d) => ({
    productoId: d.producto_id,
    nombreProducto: d.nombre_producto,
    cantidad: d.cantidad,
    precioUnitario: d.precio_unitario,
    subtotal: d.subtotal,
  }));
  const detallesSecundarios = (rSec?.detalles ?? []).map((d) => ({
    productoId: d.producto_id,
    nombreProducto: d.nombre_producto,
    cantidad: d.cantidad,
    precioUnitario: d.precio_unitario,
    subtotal: d.subtotal,
  }));

  return {
    venta: {
      id: v.id,
      creadoEn: v.creado_en,
      total: v.total + (secV ? secV.total : 0),
      metodoPagoId: v.metodo_pago_id,
      esEfectivo: v.es_efectivo,
      efectivoRecibido: v.efectivo_recibido + (secV ? secV.efectivo_recibido : 0),
      cambio: v.cambio + (secV ? secV.cambio : 0),
      estado: v.estado,
      anuladaEn: v.anulada_en,
      anuladaPor: v.anulada_por,
      motivoAnulacion: v.motivo_anulacion,
      turnoId: v.turno_id,
      tipo: v.tipo ?? 'productos',
    },
    detalles: [...detallesPrincipales, ...detallesSecundarios],
  };
}
