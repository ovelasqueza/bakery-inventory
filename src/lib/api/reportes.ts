import { llamarRpc } from '@/lib/api/errores';
import type { Rango } from '@/lib/fechas/bogota';
import type {
  AutoconsumoReporte,
  CategoriaGastoReporte,
  DatosReporte,
  EstadoVenta,
  GastoReporte,
  MetodoReporte,
  ProductoVendido,
  TipoVentaReporte,
  TurnoReporte,
  VentaReporte,
} from '@/lib/reportes/agregar';

// El detalle de una venta se obtiene con `detalleVenta` de ./ventas (Req 12.4).

// ---- Formas crudas (snake_case) devueltas por `reporte_rango` ----

interface VentaCruda {
  id: string;
  creado_en: string;
  total: number;
  metodo_pago_id: string;
  efectivo_recibido: number;
  cambio: number;
  estado: EstadoVenta;
  anulada_en: string | null;
  anulada_por: string | null;
  motivo_anulacion: string | null;
  turno_id: string;
  tipo?: TipoVentaReporte | null; // falta antes de la migración
}

interface ProductoCrudo {
  producto_id: string | null; // null = Lineas_Valor agrupadas
  nombre: string;
  cantidad: number;
  valor: number;
}

interface LineaAutoconsumoCruda {
  producto_id: string;
  nombre_producto: string;
  cantidad: number;
  precio_referencia: number;
  subtotal: number;
}

interface AutoconsumoCrudo {
  id: string;
  creado_en: string;
  turno_id: string;
  consumido_por: string;
  nota: string | null;
  valor_referencia: number;
  lineas: LineaAutoconsumoCruda[] | null;
}

interface OrigenCrudo {
  parte_id: string | null;
  nombre: string | null;
  valor: number;
}

interface GastoCrudo {
  id: string;
  creado_en: string;
  valor: number;
  concepto: string;
  categoria_gasto_id: string;
  registrado_por: string;
  turno_id: string | null;
  origenes: OrigenCrudo[] | null;
}

interface TurnoCrudo {
  id: string;
  abierto_por: string;
  abierto_en: string;
  cerrado_por: string | null;
  cerrado_en: string | null;
  base: number;
  efectivo_contado: number | null;
  efectivo_esperado: number;
  diferencia: number | null;
  por_metodo: { metodo_pago_id: string; total: number }[] | null;
  total_gastos: number | null;
  total_retiros: number | null;
  base_siguiente: number | null;
  enviado_mayor: number | null;
}

interface MetodoCrudo {
  id: string;
  nombre: string;
  es_efectivo: boolean;
  activo: boolean;
}

interface CategoriaCruda {
  id: string;
  nombre: string;
  activo: boolean;
}

interface ReporteCrudo {
  ventas: VentaCruda[] | null;
  productos: ProductoCrudo[] | null;
  gastos: GastoCrudo[] | null;
  turnos: TurnoCrudo[] | null;
  metodos: MetodoCrudo[] | null;
  categorias_gasto: CategoriaCruda[] | null;
  autoconsumos?: AutoconsumoCrudo[] | null; // falta antes de la migración
}

function numeroONulo(n: number | null | undefined): number | null {
  return n === null || n === undefined ? null : Number(n);
}

function aVenta(v: VentaCruda): VentaReporte {
  return {
    id: v.id,
    creadoEn: v.creado_en,
    total: Number(v.total),
    metodoPagoId: v.metodo_pago_id,
    efectivoRecibido: Number(v.efectivo_recibido),
    cambio: Number(v.cambio),
    estado: v.estado,
    anuladaEn: v.anulada_en ?? null,
    anuladaPor: v.anulada_por ?? null,
    motivoAnulacion: v.motivo_anulacion ?? null,
    turnoId: v.turno_id,
    tipo: v.tipo === 'valor' ? 'valor' : 'productos',
  };
}

function aProducto(p: ProductoCrudo): ProductoVendido {
  return {
    productoId: p.producto_id ?? null,
    nombre: p.nombre,
    cantidad: Number(p.cantidad),
    valor: Number(p.valor),
  };
}

function aGasto(g: GastoCrudo): GastoReporte {
  return {
    id: g.id,
    creadoEn: g.creado_en,
    valor: Number(g.valor),
    concepto: g.concepto,
    categoriaGastoId: g.categoria_gasto_id,
    registradoPor: g.registrado_por,
    turnoId: g.turno_id ?? null,
    origenes: (g.origenes ?? []).map((o) => ({
      parteId: o.parte_id ?? null,
      nombre: o.nombre ?? '',
      valor: Number(o.valor),
    })),
  };
}

function aTurno(t: TurnoCrudo): TurnoReporte {
  return {
    id: t.id,
    abiertoPor: t.abierto_por,
    abiertoEn: t.abierto_en,
    cerradoPor: t.cerrado_por ?? null,
    cerradoEn: t.cerrado_en ?? null,
    base: Number(t.base),
    efectivoContado: numeroONulo(t.efectivo_contado),
    efectivoEsperado: Number(t.efectivo_esperado),
    diferencia: numeroONulo(t.diferencia),
    porMetodo: (t.por_metodo ?? []).map((m) => ({
      metodoPagoId: m.metodo_pago_id,
      total: Number(m.total),
    })),
    totalGastos: Number(t.total_gastos ?? 0),
    totalRetiros: Number(t.total_retiros ?? 0),
    baseSiguiente: numeroONulo(t.base_siguiente),
    enviadoMayor: numeroONulo(t.enviado_mayor),
  };
}

function aMetodo(m: MetodoCrudo): MetodoReporte {
  return { id: m.id, nombre: m.nombre, esEfectivo: m.es_efectivo, activo: m.activo };
}

function aCategoria(c: CategoriaCruda): CategoriaGastoReporte {
  return { id: c.id, nombre: c.nombre, activo: c.activo };
}

function aAutoconsumo(a: AutoconsumoCrudo): AutoconsumoReporte {
  return {
    id: a.id,
    creadoEn: a.creado_en,
    turnoId: a.turno_id,
    consumidoPor: a.consumido_por,
    nota: a.nota ?? null,
    valorReferencia: Number(a.valor_referencia),
    lineas: (a.lineas ?? []).map((l) => ({
      productoId: l.producto_id,
      nombre: l.nombre_producto,
      cantidad: Number(l.cantidad),
      precio: Number(l.precio_referencia),
      subtotal: Number(l.subtotal),
    })),
  };
}

/**
 * Datos del rango de fechas locales [desde, hasta] (Req 12.11).
 * El servidor rechaza rangos inválidos con `RANGO_INVALIDO`; los errores de red
 * llegan como `SIN_CONEXION` para que la vista conserve el último reporte (Req 12.13).
 */
export async function obtenerReporte(rango: Rango): Promise<DatosReporte> {
  const data = await llamarRpc<ReporteCrudo>('reporte_rango', {
    p_desde: rango.desde,
    p_hasta: rango.hasta,
  });
  return {
    ventas: (data.ventas ?? []).map(aVenta),
    productos: (data.productos ?? []).map(aProducto),
    gastos: (data.gastos ?? []).map(aGasto),
    turnos: (data.turnos ?? []).map(aTurno),
    metodos: (data.metodos ?? []).map(aMetodo),
    categoriasGasto: (data.categorias_gasto ?? []).map(aCategoria),
    autoconsumos: (data.autoconsumos ?? []).map(aAutoconsumo),
  };
}
