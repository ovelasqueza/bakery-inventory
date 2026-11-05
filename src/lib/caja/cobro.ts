/**
 * Cálculos puros de la ventana de cobro: botones de valor rápido, evaluación del
 * efectivo recibido y datos de pago que se envían al registrar la Venta.
 * Sin dependencias de React ni de Supabase.
 */
import { validarEnteroEnRango } from './validacion';
import { firmaCarrito, totalCarrito, type Carrito } from './carrito';

/** Lo que se cobra: un Carrito de productos o una lista de valores de la calculadora (Req 5.1). */
export type PedidoCobro =
  | { tipo: 'productos'; carrito: Carrito }
  | { tipo: 'valor'; valores: number[] };

/** Total a cobrar: `totalCarrito` para productos o la suma de los valores (Req 5.1). */
export function totalPedido(p: PedidoCobro): number {
  if (p.tipo === 'productos') return totalCarrito(p.carrito);
  return p.valores.reduce((s, v) => s + v, 0);
}

/** Verdadero si no hay líneas en el Carrito o no hay valores. */
export function pedidoVacio(p: PedidoCobro): boolean {
  return p.tipo === 'productos' ? p.carrito.length === 0 : p.valores.length === 0;
}

/**
 * Firma del pedido para reutilizar la clave de idempotencia mientras no cambie (Req 5.4).
 * Productos: la misma `firmaCarrito` (un arreglo JSON, empieza por "[").
 * Valor: "valor:" + los valores en su orden, así nunca coincide con la firma de un Carrito.
 */
export function firmaPedido(p: PedidoCobro): string {
  if (p.tipo === 'productos') return firmaCarrito(p.carrito);
  return `valor:${JSON.stringify(p.valores)}`;
}

/** Billetes en COP que se ofrecen como botones de valor rápido (Req 6.3). */
export const BILLETES = [2000, 5000, 10000, 20000, 50000, 100000] as const;

/** Efectivo recibido máximo aceptado en COP (Req 6.7). */
export const RECIBIDO_MAX = 10_000_000;

/**
 * Botones de valor rápido: el total exacto y cada billete mayor al total,
 * en orden ascendente (Req 6.3).
 */
export function botonesRapidos(total: number): number[] {
  return [total, ...BILLETES.filter((b) => b > total)];
}

export type EstadoEfectivo =
  | { estado: 'invalido'; motivo: 'VACIO' | 'NO_ENTERO' | 'NEGATIVO' | 'MAXIMO' }
  | { estado: 'falta'; falta: number }
  | { estado: 'completo'; cambio: number };

const ENTERO_NEGATIVO = /^-\d+$/;

/**
 * Evalúa el texto del campo de efectivo recibido contra el total (Req 6.5–6.7).
 * - vacío, no entero, negativo o mayor a RECIBIDO_MAX: inválido.
 * - menor al total: falta = total − recibido.
 * - mayor o igual al total: cambio = recibido − total.
 */
export function evaluarEfectivo(total: number, textoRecibido: string): EstadoEfectivo {
  const texto = textoRecibido.trim();
  const r = validarEnteroEnRango(texto, 0, RECIBIDO_MAX);
  if (!r.ok) {
    if (r.error === 'VACIO') return { estado: 'invalido', motivo: 'VACIO' };
    if (r.error === 'RANGO') return { estado: 'invalido', motivo: 'MAXIMO' };
    if (ENTERO_NEGATIVO.test(texto)) return { estado: 'invalido', motivo: 'NEGATIVO' };
    return { estado: 'invalido', motivo: 'NO_ENTERO' };
  }
  const recibido = r.valor;
  if (recibido < total) return { estado: 'falta', falta: total - recibido };
  return { estado: 'completo', cambio: recibido - total };
}

/**
 * Efectivo recibido y cambio que se registran en la Venta.
 * Para un método que no es efectivo: recibido = total y cambio = 0 (Req 6.4).
 * Para efectivo: recibido es el valor validado y cambio = recibido − total (Req 6.5).
 */
export function datosPago(
  total: number,
  esEfectivo: boolean,
  recibido: number | null
): { recibido: number; cambio: number } {
  if (!esEfectivo) return { recibido: total, cambio: 0 };
  if (recibido === null || recibido < total) {
    throw new Error('El efectivo recibido debe ser mayor o igual al total');
  }
  return { recibido, cambio: recibido - total };
}

/** Método de pago tal como lo necesita el cobro directo de la Calculadora. */
export type MetodoCobro = { id: string; esEfectivo: boolean; activo: boolean };

/** Primer método activo de efectivo; si no hay, el primer activo; null si no hay activos (Req 5.2). */
export function metodoPorDefecto(metodos: MetodoCobro[]): string | null {
  const efectivo = metodos.find((m) => m.activo && m.esEfectivo);
  if (efectivo) return efectivo.id;
  return metodos.find((m) => m.activo)?.id ?? null;
}

/** El id si sigue activo; si no, metodoPorDefecto (Req 5.4). */
export function metodoVigente(metodos: MetodoCobro[], id: string | null): string | null {
  if (id !== null && metodos.some((m) => m.activo && m.id === id)) return id;
  return metodoPorDefecto(metodos);
}

export type CobroDirecto =
  | { ok: true; recibido: number | null; total: number; cambio: 0 }
  | { ok: false; motivo: 'VACIO' | 'EFECTIVO_MAXIMO' };

/**
 * Datos de pago del cobro directo de la Calculadora (Req 6.3–6.5).
 * Efectivo: recibido = total (cambio 0); si total > RECIBIDO_MAX → EFECTIVO_MAXIMO.
 * Otro método: recibido = null (el servidor guarda recibido = total).
 */
export function datosCobroDirecto(valores: number[], esEfectivo: boolean): CobroDirecto {
  if (valores.length === 0) return { ok: false, motivo: 'VACIO' };
  const total = valores.reduce((s, v) => s + v, 0);
  if (!esEfectivo) return { ok: true, recibido: null, total, cambio: 0 };
  if (total > RECIBIDO_MAX) return { ok: false, motivo: 'EFECTIVO_MAXIMO' };
  return { ok: true, recibido: total, total, cambio: 0 };
}

/** firmaPedido({ tipo: 'valor', valores }) + '|' + metodoId (Req 6.6). */
export function firmaCobroDirecto(valores: number[], metodoId: string): string {
  return `${firmaPedido({ tipo: 'valor', valores })}|${metodoId}`;
}
