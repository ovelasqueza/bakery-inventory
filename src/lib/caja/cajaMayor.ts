// Modelo de la Caja mayor: orígenes de gasto, base automática y saldos por Parte.
// Módulo puro (sin React ni Supabase). Las mismas reglas existen en SQL
// (registrar_gasto, cerrar_turno, mover_caja_mayor, base_proximo_turno); manda el servidor.

import type { OrigenGastoTurno, VentaTurno } from './turno';

/** Fuente de un gasto: `parteId` null = Cajón; si no, `caja_mayor_saldos.id`. */
export type OrigenGasto = OrigenGastoTurno;

/** Movimiento sobre una Parte: valor > 0 entra, valor < 0 sale. */
export type MovimientoParte = { parteId: string; valor: number };

export type ErrorOrigen =
  | 'SUMA_DISTINTA'
  | 'VALOR_INVALIDO'
  | 'FUENTE_REPETIDA'
  | 'PARTE_INEXISTENTE'
  | 'CAJON_SIN_TURNO'
  | 'VACIO';

/**
 * Valida los orígenes de un gasto (Req 6.3, 6.4, 8.7): lista no vacía, valores enteros ≥ 1,
 * sin fuentes repetidas, Partes existentes, sin Cajón cuando no hay Turno y suma = `valor`.
 */
export function validarOrigenes(
  valor: number,
  origenes: OrigenGasto[],
  opciones: { conTurno: boolean; partes: Set<string> }
): { ok: true } | { ok: false; error: ErrorOrigen } {
  if (origenes.length === 0) return { ok: false, error: 'VACIO' };

  const vistas = new Set<string | null>();
  let suma = 0;
  for (const o of origenes) {
    if (!Number.isInteger(o.valor) || o.valor < 1) return { ok: false, error: 'VALOR_INVALIDO' };
    if (vistas.has(o.parteId)) return { ok: false, error: 'FUENTE_REPETIDA' };
    vistas.add(o.parteId);
    if (o.parteId === null) {
      if (!opciones.conTurno) return { ok: false, error: 'CAJON_SIN_TURNO' };
    } else if (!opciones.partes.has(o.parteId)) {
      return { ok: false, error: 'PARTE_INEXISTENTE' };
    }
    suma += o.valor;
  }

  if (suma !== valor) return { ok: false, error: 'SUMA_DISTINTA' };
  return { ok: true };
}

/**
 * Base del siguiente turno: `base_siguiente` del último Turno cerrado si es un entero ≥ 0;
 * si no (nulo o cierre antiguo), la base de configuración (Req 2.1, 2.2).
 */
export function baseProximoTurno(
  ultimaBaseSiguiente: number | null | undefined,
  baseDefecto: number
): number {
  if (typeof ultimaBaseSiguiente === 'number' && Number.isInteger(ultimaBaseSiguiente) && ultimaBaseSiguiente >= 0) {
    return ultimaBaseSiguiente;
  }
  return baseDefecto;
}

/**
 * Entradas a la Caja mayor al cerrar (Req 4.1, 4.2, 4.3): el efectivo enviado va a la Parte
 * Efectivo (`metodoPagoId` null) y las ventas registradas no efectivo a la Parte de su método.
 * Omite valores 0 y ventas anuladas o en efectivo. Efectivo primero; luego métodos en orden de aparición.
 */
export function entradasCierre(
  enviadoEfectivo: number,
  ventas: VentaTurno[]
): { metodoPagoId: string | null; valor: number }[] {
  const entradas: { metodoPagoId: string | null; valor: number }[] = [];
  if (enviadoEfectivo !== 0) entradas.push({ metodoPagoId: null, valor: enviadoEfectivo });

  const porMetodo = new Map<string, number>();
  for (const v of ventas) {
    if (v.estado !== 'registrada' || v.esEfectivo) continue;
    porMetodo.set(v.metodoPagoId, (porMetodo.get(v.metodoPagoId) ?? 0) + v.total);
  }
  porMetodo.forEach((valor, metodoPagoId) => {
    if (valor !== 0) entradas.push({ metodoPagoId, valor });
  });
  return entradas;
}

/**
 * Aplica movimientos en orden (modelo de `mover_caja_mayor`, Req 3.2, 3.3, 3.4).
 * Si alguna Parte quedaría < 0 en algún paso rechaza el lote completo y no cambia `saldos`.
 * Una Parte ausente en `saldos` arranca en 0. Devuelve un mapa nuevo y el saldo después de cada movimiento.
 */
export function aplicarMovimientos(
  saldos: Map<string, number>,
  movs: MovimientoParte[]
): { ok: true; saldos: Map<string, number>; saldosDespues: number[] } | { ok: false; parteId: string } {
  const nuevos = new Map(saldos);
  const saldosDespues: number[] = [];
  for (const m of movs) {
    const despues = (nuevos.get(m.parteId) ?? 0) + m.valor;
    if (despues < 0) return { ok: false, parteId: m.parteId };
    nuevos.set(m.parteId, despues);
    saldosDespues.push(despues);
  }
  return { ok: true, saldos: nuevos, saldosDespues };
}

/** Salidas de la Caja mayor por un gasto: una por cada origen con Parte (el Cajón no toca la Caja mayor). */
export function movimientosGasto(origenes: OrigenGasto[]): MovimientoParte[] {
  const movs: MovimientoParte[] = [];
  for (const o of origenes) {
    if (o.parteId !== null) movs.push({ parteId: o.parteId, valor: -o.valor });
  }
  return movs;
}

/** Devoluciones a la Caja mayor al eliminar un gasto (Req 7.1): inverso de `movimientosGasto`. */
export function movimientosEliminacion(origenes: OrigenGasto[]): MovimientoParte[] {
  const movs: MovimientoParte[] = [];
  for (const o of origenes) {
    if (o.parteId !== null) movs.push({ parteId: o.parteId, valor: o.valor });
  }
  return movs;
}

const CAJON = 'Cajón';

/**
 * Texto del origen de un gasto (Req 6.9, 9.2): "Cajón" para la lista vacía (gasto antiguo),
 * el nombre de la fuente si hay una sola y "Cajón $ 20.000 + Nequi $ 30.000" si hay varias.
 * Una Parte sin nombre conocido se muestra como "Caja mayor".
 */
export function textoOrigen(
  origenes: OrigenGasto[],
  nombres: Map<string, string>,
  formatear: (n: number) => string
): string {
  const nombre = (o: OrigenGasto) =>
    o.parteId === null ? CAJON : nombres.get(o.parteId) ?? 'Caja mayor';
  if (origenes.length === 0) return CAJON;
  if (origenes.length === 1) return nombre(origenes[0]);
  return origenes.map((o) => `${nombre(o)} ${formatear(o.valor)}`).join(' + ');
}
