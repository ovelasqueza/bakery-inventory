// Cálculos de efectivo y cierre del Turno. Módulo puro (sin React ni Supabase).
// La misma fórmula existe en SQL (efectivo_esperado_turno); en el cierre manda el servidor.

export type VentaTurno = {
  total: number;
  esEfectivo: boolean;
  estado: 'registrada' | 'anulada';
  metodoPagoId: string;
};

/** Fuente de un gasto: `parteId` null = Cajón; si no, una Parte de la Caja mayor. */
export type OrigenGastoTurno = { parteId: string | null; valor: number };

/** `origenes` ausente o vacío = gasto antiguo, sale 100 % del cajón. */
export type GastoTurno = { valor: number; eliminado: boolean; origenes?: OrigenGastoTurno[] };

export type MovimientosTurno = {
  base: number;
  ventas: VentaTurno[];
  gastos: GastoTurno[];
  /** Valores de los retiros a la Caja mayor; ausente = sin retiros. */
  retiros?: number[];
};

export type ClasificacionDiferencia = 'Cuadra' | 'Sobrante' | 'Faltante';

/** Valor del gasto que sale del cajón; sin orígenes (gasto antiguo) es el valor completo. */
export function parteCajon(g: GastoTurno): number {
  if (!g.origenes || g.origenes.length === 0) return g.valor;
  return g.origenes.reduce((s, o) => (o.parteId === null ? s + o.valor : s), 0);
}

/**
 * Base + Σ ventas registradas en efectivo − Σ Parte_Cajon de gastos no eliminados − Σ retiros
 * (Req 5.5, 6.6, 10.2).
 */
export function efectivoEsperado(m: MovimientosTurno): number {
  const ventasEfectivo = m.ventas.reduce(
    (s, v) => (v.esEfectivo && v.estado === 'registrada' ? s + v.total : s),
    0
  );
  const gastos = m.gastos.reduce((s, g) => (g.eliminado ? s : s + parteCajon(g)), 0);
  const retiros = (m.retiros ?? []).reduce((s, r) => s + r, 0);
  return m.base + ventasEfectivo - gastos - retiros;
}

/** Efectivo disponible para gastos: misma fórmula que el esperado (Req 8.4). */
export const efectivoDisponible = efectivoEsperado;

/** Retiro o Parte_Cajon que supera el esperado pide confirmación, sin mostrar cifras (Req 5.3, 6.7). */
export function requiereAdvertencia(valor: number, esperado: number): boolean {
  return valor > esperado;
}

/** @deprecated Usar `requiereAdvertencia(valor, efectivoEsperado(m))`. */
export function requiereAdvertenciaGasto(valor: number, m: MovimientosTurno): boolean {
  return requiereAdvertencia(valor, efectivoDisponible(m));
}

export type ErrorCierre = 'BASE_MAYOR_CONTADO';

/**
 * Valida contado ≥ 0 y 0 ≤ base ≤ contado; devuelve enviado = contado − base (Req 1.3, 1.4).
 * Los rangos y la condición de entero los revisa `validarEnteroEnRango` antes de llamar aquí.
 */
export function calcularCierre(
  contado: number,
  base: number
): { ok: true; enviado: number } | { ok: false; error: ErrorCierre } {
  if (contado < 0 || base < 0 || base > contado) return { ok: false, error: 'BASE_MAYOR_CONTADO' };
  return { ok: true, enviado: contado - base };
}

/** Total de ventas registradas por método de pago; las anuladas no cuentan (Req 7.4). */
export function totalesPorMetodo(m: MovimientosTurno): Map<string, number> {
  const totales = new Map<string, number>();
  for (const v of m.ventas) {
    if (v.estado !== 'registrada') continue;
    totales.set(v.metodoPagoId, (totales.get(v.metodoPagoId) ?? 0) + v.total);
  }
  return totales;
}

/** Diferencia de cierre = efectivo contado − efectivo esperado (Req 3.4). */
export function diferenciaCierre(contado: number, esperado: number): number {
  return contado - esperado;
}

/** 0 → Cuadra, > 0 → Sobrante, < 0 → Faltante (Req 3.5). */
export function clasificarDiferencia(d: number): ClasificacionDiferencia {
  if (d === 0) return 'Cuadra';
  return d > 0 ? 'Sobrante' : 'Faltante';
}
