// Autoconsumo de la Caja: validación, valor de referencia y textos. Módulo puro (sin React ni Supabase).
// La Seleccion_Autoconsumo es un `Carrito` y se maneja con `reducirCarrito` y `conciliarCarrito`
// de `carrito.ts`, con las mismas reglas de cantidad que el Pedido_Productos (Req 8.3).
import { totalCarrito, type Carrito } from './carrito';
import { validarNombrePersona, validarTextoLargo } from './validacion';

export const NOTA_MAX = 120;

export type ErroresAutoconsumo = {
  lineas?: 'VACIO';
  persona?: 'VACIO' | 'LARGO';
  nota?: 'LARGO';
};

/**
 * Valida el Autoconsumo antes de enviarlo (Req 9.2): selección no vacía, Persona_Caja de 1 a 60
 * caracteres tras quitar espacios y nota opcional de hasta 120. La nota vacía queda en `null`.
 */
export function validarAutoconsumo(e: {
  seleccion: Carrito;
  persona: string;
  nota: string;
}):
  | { ok: true; persona: string; nota: string | null }
  | { ok: false; errores: ErroresAutoconsumo } {
  const errores: ErroresAutoconsumo = {};
  if (e.seleccion.length === 0) errores.lineas = 'VACIO';

  const persona = validarNombrePersona(e.persona);
  if (!persona.ok) errores.persona = persona.error;

  const nota = validarTextoLargo(e.nota, 0, NOTA_MAX);
  if (!nota.ok) errores.nota = 'LARGO';

  if (!persona.ok || !nota.ok || errores.lineas) return { ok: false, errores };
  return { ok: true, persona: persona.valor, nota: nota.valor.length > 0 ? nota.valor : null };
}

/** Valor_Referencia: Σ cantidad × precio de venta (no se cobra) (Req 8.4). */
export const valorReferencia = (c: Carrito): number => totalCarrito(c);

/** "2 × Pan blandito, 1 × Gaseosa" en el orden recibido (Req 9.1). */
export function textoProductos(lineas: { nombre: string; cantidad: number }[]): string {
  return lineas.map((l) => `${l.cantidad} × ${l.nombre}`).join(', ');
}

/**
 * Firma estable del Autoconsumo para reutilizar la clave de idempotencia mientras no cambien
 * el Turno, la selección (sin importar el orden), la persona ni la nota.
 */
export function firmaAutoconsumo(
  turnoId: string,
  seleccion: Carrito,
  persona: string,
  nota: string
): string {
  const lineas = seleccion
    .map((l) => [l.productoId, l.cantidad, l.precio] as const)
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return JSON.stringify([turnoId, lineas, persona.trim(), nota.trim()]);
}
