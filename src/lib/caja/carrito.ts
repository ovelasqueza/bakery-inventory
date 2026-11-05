// Carrito de la Caja: reducer y cálculos. Módulo puro (sin React ni Supabase).
import type { ProductoCaja } from './busqueda';

export const CANTIDAD_MAX = 999;

export type LineaCarrito = { productoId: string; nombre: string; precio: number; cantidad: number };
export type Carrito = LineaCarrito[];

export type AccionCarrito =
  | { tipo: 'agregar'; producto: { id: string; nombre: string; precio: number } }
  | { tipo: 'sumar'; productoId: string }
  | { tipo: 'restar'; productoId: string } // con cantidad 1 quita la línea
  | { tipo: 'fijar'; productoId: string; cantidad: number } // 0 quita; inválido no cambia
  | { tipo: 'quitar'; productoId: string }
  | { tipo: 'vaciar' }
  | { tipo: 'reemplazar'; carrito: Carrito };

export type ResultadoCarrito = { carrito: Carrito; aviso?: 'CANTIDAD_MAXIMA' | 'CANTIDAD_INVALIDA' };

const esCantidadValida = (n: number) => Number.isInteger(n) && n >= 1 && n <= CANTIDAD_MAX;

function sumar(c: Carrito, productoId: string): ResultadoCarrito {
  const linea = c.find((l) => l.productoId === productoId);
  if (!linea) return { carrito: c };
  if (linea.cantidad >= CANTIDAD_MAX) return { carrito: c, aviso: 'CANTIDAD_MAXIMA' };
  return {
    carrito: c.map((l) => (l.productoId === productoId ? { ...l, cantidad: l.cantidad + 1 } : l)),
  };
}

/** Deja una sola línea por producto (suma cantidades hasta 999) y descarta cantidades inválidas. */
function normalizar(c: Carrito): Carrito {
  const porId = new Map<string, LineaCarrito>();
  for (const l of c) {
    if (!esCantidadValida(l.cantidad)) continue;
    const previa = porId.get(l.productoId);
    porId.set(
      l.productoId,
      previa ? { ...previa, cantidad: Math.min(CANTIDAD_MAX, previa.cantidad + l.cantidad) } : { ...l }
    );
  }
  return Array.from(porId.values());
}

export function reducirCarrito(c: Carrito, a: AccionCarrito): ResultadoCarrito {
  switch (a.tipo) {
    case 'agregar': {
      const { id, nombre, precio } = a.producto;
      if (c.some((l) => l.productoId === id)) return sumar(c, id);
      return { carrito: [...c, { productoId: id, nombre, precio, cantidad: 1 }] };
    }
    case 'sumar':
      return sumar(c, a.productoId);
    case 'restar': {
      const linea = c.find((l) => l.productoId === a.productoId);
      if (!linea) return { carrito: c };
      if (linea.cantidad <= 1) return { carrito: c.filter((l) => l.productoId !== a.productoId) };
      return {
        carrito: c.map((l) => (l.productoId === a.productoId ? { ...l, cantidad: l.cantidad - 1 } : l)),
      };
    }
    case 'fijar': {
      if (a.cantidad === 0) return { carrito: c.filter((l) => l.productoId !== a.productoId) };
      if (!esCantidadValida(a.cantidad)) return { carrito: c, aviso: 'CANTIDAD_INVALIDA' };
      if (!c.some((l) => l.productoId === a.productoId)) return { carrito: c };
      return {
        carrito: c.map((l) => (l.productoId === a.productoId ? { ...l, cantidad: a.cantidad } : l)),
      };
    }
    case 'quitar':
      return { carrito: c.filter((l) => l.productoId !== a.productoId) };
    case 'vaciar':
      return { carrito: [] };
    case 'reemplazar':
      return { carrito: normalizar(a.carrito) };
  }
}

export const subtotalLinea = (l: LineaCarrito) => l.cantidad * l.precio;
export const totalCarrito = (c: Carrito) => c.reduce((s, l) => s + subtotalLinea(l), 0);
export const articulosCarrito = (c: Carrito) => c.reduce((s, l) => s + l.cantidad, 0);

/**
 * Firma estable del contenido del Carrito (producto, cantidad y precio), independiente del
 * orden de las líneas. Sirve para reutilizar la clave de cobro mientras el Carrito no cambie.
 */
export function firmaCarrito(c: Carrito): string {
  const partes = c
    .map((l) => [l.productoId, l.cantidad, l.precio] as const)
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return JSON.stringify(partes);
}

/**
 * Ajusta el Carrito al catálogo vigente: quita las líneas cuyo producto ya no está
 * (`retirados`) y actualiza nombre y precio de las que cambiaron de precio (`conPrecioNuevo`).
 * Conserva el orden y las cantidades.
 */
export function conciliarCarrito(
  c: Carrito,
  vigentes: ProductoCaja[]
): { carrito: Carrito; retirados: string[]; conPrecioNuevo: string[] } {
  const porId = new Map(vigentes.map((p) => [p.id, p] as const));
  const carrito: Carrito = [];
  const retirados: string[] = [];
  const conPrecioNuevo: string[] = [];
  for (const l of c) {
    const p = porId.get(l.productoId);
    if (!p) {
      retirados.push(l.productoId);
      continue;
    }
    if (p.precio !== l.precio) conPrecioNuevo.push(l.productoId);
    carrito.push({ ...l, nombre: p.nombre, precio: p.precio });
  }
  return { carrito, retirados, conPrecioNuevo };
}

/** Lee el campo de cantidad: solo dígitos (con espacios alrededor), entero entre 0 y 999. */
export function parsearCantidad(texto: string): { ok: true; valor: number } | { ok: false } {
  const t = texto.trim();
  if (!/^\d+$/.test(t)) return { ok: false };
  const valor = Number(t);
  if (valor > CANTIDAD_MAX) return { ok: false };
  return { ok: true, valor };
}
