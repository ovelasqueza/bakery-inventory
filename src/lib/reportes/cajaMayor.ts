// Datos de la pestaña Caja mayor en Reportes: saldos visibles y tabla de movimientos (Req 8.2, 8.3).

import type { MovimientoMayor, ParteCajaMayor, TipoMovimientoMayor } from '@/lib/api/cajaMayor';
import { fechaHora12 } from '@/lib/fechas/bogota';
import { formatCurrency } from '@/lib/utils';
import type { Tabla } from './tablas';

export const ETIQUETA_TIPO: Record<TipoMovimientoMayor, string> = {
  cierre_turno: 'Cierre de turno',
  retiro: 'Retiro',
  gasto: 'Gasto',
  eliminacion_gasto: 'Gasto eliminado',
  ajuste: 'Ajuste',
};

export const COLUMNAS_MOVIMIENTOS = [
  'Fecha y hora',
  'Tipo',
  'Parte',
  'Valor',
  'Saldo después',
  'Persona',
  'Descripción',
  'Acción',
];

/** Índices de columna que la pantalla formatea como dinero. */
export const COLUMNA_VALOR = 3;
export const COLUMNA_SALDO = 4;
export const COLUMNA_ACCION = 7;

/** Nombre visible de una Parte: la Parte sin método de pago es Efectivo. */
export function nombreParte(p: ParteCajaMayor): string {
  return p.metodoPagoId === null ? 'Efectivo' : p.nombre;
}

/** Partes que se muestran: se ocultan las inactivas con saldo 0. */
export function partesVisibles(partes: ParteCajaMayor[]): ParteCajaMayor[] {
  return partes.filter((p) => p.activo || p.saldo !== 0);
}

export function totalSaldos(partes: ParteCajaMayor[]): number {
  return partes.reduce((s, p) => s + p.saldo, 0);
}

/** Gasto_Sin_Turno todavía no eliminado: se puede eliminar desde la caja mayor (Req 7.4). */
export function esGastoEliminable(m: MovimientoMayor): boolean {
  return m.tipo === 'gasto' && m.turnoId === null && m.gastoId !== null && !m.gastoEliminado;
}

/** Más reciente primero; a igual hora conserva el orden recibido. */
export function ordenarMovimientos(movimientos: MovimientoMayor[]): MovimientoMayor[] {
  return movimientos
    .map((m, i) => ({ m, i, t: Date.parse(m.creadoEn) }))
    .sort((a, b) => (b.t - a.t) || (a.i - b.i))
    .map((x) => x.m);
}

/** "+$ 1.000" si entra, "-$ 1.000" si sale. */
export function valorConSigno(valor: number): string {
  return valor > 0 ? `+${formatCurrency(valor)}` : formatCurrency(valor);
}

/**
 * Tabla de movimientos ya ordenados. Valor y saldo quedan como números para que
 * la pantalla los alinee a la derecha y les dé formato; la columna Acción queda vacía.
 */
export function tablaMovimientos(movimientos: MovimientoMayor[]): Tabla {
  return {
    titulo: 'Movimientos',
    columnas: COLUMNAS_MOVIMIENTOS,
    filas: movimientos.map((m) => [
      fechaHora12(m.creadoEn),
      ETIQUETA_TIPO[m.tipo] ?? m.tipo,
      m.parteNombre,
      m.valor,
      m.saldoDespues,
      m.persona ?? '',
      m.descripcion ?? '',
      '',
    ]),
  };
}
