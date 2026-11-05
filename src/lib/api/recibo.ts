import { llamarRpc } from './errores';

/** Datos del Recibo_Cierre de un Turno cerrado (RPC `recibo_cierre`). */
export interface DatosRecibo {
  turno: {
    id: string; abiertoPor: string; abiertoEn: string; cerradoPor: string; cerradoEn: string;
    base: number; efectivoEsperado: number; efectivoContado: number; diferencia: number;
    baseSiguiente: number | null; enviadoMayor: number | null;
  };
  ventas: {
    total: number; cantidad: number; efectivo: number; valorTotal: number;
    anuladasTotal: number; anuladasCantidad: number;
    porMetodo: { nombre: string; esEfectivo: boolean; total: number; cantidad: number }[];
  };
  gastos: {
    lista: { creadoEn: string; categoria: string; concepto: string; valor: number; cajon: number; mayor: number }[];
    total: number; cajon: number; mayor: number;
  };
  retiros: { lista: { creadoEn: string; valor: number }[]; total: number };
  productos: { nombre: string; cantidad: number; valor: number }[];
  autoconsumo: { productos: { nombre: string; cantidad: number; valor: number }[]; total: number };
}

type Num = number | string | null | undefined;

interface ProductoCrudo { nombre: string | null; cantidad: Num; valor: Num }

interface ReciboCrudo {
  turno: {
    id: string; abierto_por: string | null; abierto_en: string; cerrado_por: string | null; cerrado_en: string;
    base: Num; efectivo_esperado: Num; efectivo_contado: Num; diferencia: Num;
    base_siguiente: Num; enviado_mayor: Num;
  };
  ventas?: {
    total?: Num; cantidad?: Num; efectivo?: Num; valor_total?: Num;
    anuladas_total?: Num; anuladas_cantidad?: Num;
    por_metodo?: { nombre: string | null; es_efectivo: boolean | null; total: Num; cantidad: Num }[] | null;
  } | null;
  gastos?: {
    lista?: { creado_en: string; categoria: string | null; concepto: string | null; valor: Num; cajon: Num; mayor: Num }[] | null;
    total?: Num; cajon?: Num; mayor?: Num;
  } | null;
  retiros?: { lista?: { creado_en: string; valor: Num }[] | null; total?: Num } | null;
  productos?: ProductoCrudo[] | null;
  autoconsumo?: { productos?: ProductoCrudo[] | null; total?: Num } | null;
}

/** Número del JSON (puede llegar como string desde numeric); nulo o inválido → 0. */
function num(v: Num): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Igual que `num` pero conserva el nulo (turnos antiguos sin el dato). */
function numONulo(v: Num): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function aProductos(lista: ProductoCrudo[] | null | undefined): DatosRecibo['productos'] {
  return (lista ?? []).map((p) => ({
    nombre: p.nombre ?? '',
    cantidad: num(p.cantidad),
    valor: num(p.valor),
  }));
}

/** Convierte la respuesta cruda de `recibo_cierre` (snake_case) a `DatosRecibo`. */
export function aDatosRecibo(r: ReciboCrudo): DatosRecibo {
  const t = r.turno;
  const v = r.ventas ?? {};
  const g = r.gastos ?? {};
  const re = r.retiros ?? {};
  const a = r.autoconsumo ?? {};
  return {
    turno: {
      id: t.id,
      abiertoPor: t.abierto_por ?? '',
      abiertoEn: t.abierto_en,
      cerradoPor: t.cerrado_por ?? '',
      cerradoEn: t.cerrado_en,
      base: num(t.base),
      efectivoEsperado: num(t.efectivo_esperado),
      efectivoContado: num(t.efectivo_contado),
      diferencia: num(t.diferencia),
      baseSiguiente: numONulo(t.base_siguiente),
      enviadoMayor: numONulo(t.enviado_mayor),
    },
    ventas: {
      total: num(v.total),
      cantidad: num(v.cantidad),
      efectivo: num(v.efectivo),
      valorTotal: num(v.valor_total),
      anuladasTotal: num(v.anuladas_total),
      anuladasCantidad: num(v.anuladas_cantidad),
      porMetodo: (v.por_metodo ?? []).map((m) => ({
        nombre: m.nombre ?? '',
        esEfectivo: m.es_efectivo === true,
        total: num(m.total),
        cantidad: num(m.cantidad),
      })),
    },
    gastos: {
      lista: (g.lista ?? []).map((x) => ({
        creadoEn: x.creado_en,
        categoria: x.categoria ?? '',
        concepto: x.concepto ?? '',
        valor: num(x.valor),
        cajon: num(x.cajon),
        mayor: num(x.mayor),
      })),
      total: num(g.total),
      cajon: num(g.cajon),
      mayor: num(g.mayor),
    },
    retiros: {
      lista: (re.lista ?? []).map((x) => ({ creadoEn: x.creado_en, valor: num(x.valor) })),
      total: num(re.total),
    },
    productos: aProductos(r.productos),
    autoconsumo: { productos: aProductos(a.productos), total: num(a.total) },
  };
}

/**
 * Datos del Recibo_Cierre del turno. Lanza `TURNO_NO_ABIERTO` si el turno no existe,
 * `TURNO_NO_CERRADO` si sigue abierto y `SIN_CONEXION` sin red.
 */
export async function datosReciboCierre(turnoId: string): Promise<DatosRecibo> {
  const r = await llamarRpc<ReciboCrudo>('recibo_cierre', { p_turno: turnoId });
  return aDatosRecibo(r);
}
