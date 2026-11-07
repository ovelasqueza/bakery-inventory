// Carrito de la Caja: reducer y cálculos. Módulo puro (sin React ni Supabase).
import type { ProductoCaja, PromocionProducto } from './busqueda';

export const CANTIDAD_MAX = 999;

export type LineaCarrito = {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  promocion?: PromocionProducto | null;
};
export type Carrito = LineaCarrito[];

export type AccionCarrito =
  | {
      tipo: 'agregar';
      producto: { id: string; nombre: string; precio: number; promocion?: PromocionProducto | null };
      cantidad?: number;
    }
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
      const { id, nombre, precio, promocion } = a.producto;
      const incremento = a.cantidad !== undefined ? a.cantidad : 1;
      if (!esCantidadValida(incremento)) return { carrito: c, aviso: 'CANTIDAD_INVALIDA' };
      const existente = c.find((l) => l.productoId === id);
      if (existente) {
        if (existente.cantidad >= CANTIDAD_MAX) return { carrito: c, aviso: 'CANTIDAD_MAXIMA' };
        const nuevaCantidad = Math.min(CANTIDAD_MAX, existente.cantidad + incremento);
        const aviso = existente.cantidad + incremento > CANTIDAD_MAX ? 'CANTIDAD_MAXIMA' : undefined;
        return {
          carrito: c.map((l) =>
            l.productoId === id
              ? { ...l, cantidad: nuevaCantidad, promocion: promocion ?? l.promocion ?? null }
              : l
          ),
          ...(aviso ? { aviso } : {}),
        };
      }
      return {
        carrito: [
          ...c,
          { productoId: id, nombre, precio, cantidad: incremento, promocion: promocion ?? null },
        ],
      };
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

export type DesglosePromoLinea = {
  promos: number;
  unidadesPromo: number;
  subtotalPromo: number;
  unidadesNormales: number;
  subtotalNormal: number;
  total: number;
};

/**
 * Descompone `cantidad` combinando promociones y unidades normales cuando el total resultante
 * es múltiplo exacto de la promoción (ej. 8 = $3.000, 16 = $6.000) o redondea exactamente al mil
 * (ej. 13 panes = 1 promo de 8 [$3.000] + 5 panes [$2.000] = $5.000; 10 panes = 10 × $400 = $4.000).
 */
export function descomponerCantidadConPromo(
  cantidad: number,
  precio: number,
  promocion?: PromocionProducto | null
): DesglosePromoLinea {
  const totalSinPromo = cantidad * precio;
  if (
    !promocion ||
    promocion.cantidad <= 0 ||
    promocion.precio <= 0 ||
    cantidad < promocion.cantidad
  ) {
    return {
      promos: 0,
      unidadesPromo: 0,
      subtotalPromo: 0,
      unidadesNormales: cantidad,
      subtotalNormal: totalSinPromo,
      total: totalSinPromo,
    };
  }

  const maxPromos = Math.floor(cantidad / promocion.cantidad);
  for (let k = maxPromos; k >= 1; k--) {
    const unidadesPromo = k * promocion.cantidad;
    const unidadesNormales = cantidad - unidadesPromo;
    const subtotalPromo = k * promocion.precio;
    const subtotalNormal = unidadesNormales * precio;
    const total = subtotalPromo + subtotalNormal;
    if (unidadesNormales === 0 || total % 1000 === 0) {
      return {
        promos: k,
        unidadesPromo,
        subtotalPromo,
        unidadesNormales,
        subtotalNormal,
        total,
      };
    }
  }

  return {
    promos: 0,
    unidadesPromo: 0,
    subtotalPromo: 0,
    unidadesNormales: cantidad,
    subtotalNormal: totalSinPromo,
    total: totalSinPromo,
  };
}

/**
 * Calcula cuántas unidades corresponden a un monto en pesos ($), combinando promociones
 * y unidades normales si da exacto (ej. $3.000 = 8, $4.000 = 10, $5.000 = 13, $6.000 = 16, $10.000 = 26).
 */
export function calcularUnidadesPorMonto(
  monto: number,
  precio: number,
  promocion?: PromocionProducto | null
):
  | { exacto: true; unidades: number; promos: number; unidadesNormales: number }
  | { exacto: false; unidadesInf: number; unidadesSup: number } {
  const precioSeguro = Math.max(1, precio);
  if (promocion && promocion.cantidad > 0 && promocion.precio > 0) {
    const maxPromos = Math.floor(monto / promocion.precio);
    for (let k = maxPromos; k >= 0; k--) {
      const resto = monto - k * promocion.precio;
      if (resto >= 0 && resto % precioSeguro === 0) {
        const unidadesNormales = resto / precioSeguro;
        const unidades = k * promocion.cantidad + unidadesNormales;
        if (unidades >= 1 && unidades <= CANTIDAD_MAX) {
          return { exacto: true, unidades, promos: k, unidadesNormales };
        }
      }
    }
  } else if (monto % precioSeguro === 0) {
    const unidades = monto / precioSeguro;
    if (unidades >= 1 && unidades <= CANTIDAD_MAX) {
      return { exacto: true, unidades, promos: 0, unidadesNormales: unidades };
    }
  }

  const unidadesInf = Math.min(CANTIDAD_MAX, Math.floor(monto / precioSeguro));
  const unidadesSup = Math.min(CANTIDAD_MAX, unidadesInf + 1);
  return { exacto: false, unidadesInf, unidadesSup };
}

export const tienePromoAplicada = (l: LineaCarrito): boolean =>
  descomponerCantidadConPromo(l.cantidad, l.precio, l.promocion).promos > 0;

export const subtotalLinea = (l: LineaCarrito): number =>
  descomponerCantidadConPromo(l.cantidad, l.precio, l.promocion).total;
export const totalCarrito = (c: Carrito) => c.reduce((s, l) => s + subtotalLinea(l), 0);
export const articulosCarrito = (c: Carrito) => c.reduce((s, l) => s + l.cantidad, 0);

/**
 * Firma estable del contenido del Carrito (producto, cantidad, precio y subtotal), independiente del
 * orden de las líneas. Sirve para reutilizar la clave de cobro mientras el Carrito no cambie.
 */
export function firmaCarrito(c: Carrito): string {
  const partes = c
    .map((l) => [l.productoId, l.cantidad, l.precio, subtotalLinea(l)] as const)
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return JSON.stringify(partes);
}

/**
 * Ajusta el Carrito al catálogo vigente: quita las líneas cuyo producto ya no está
 * (`retirados`) y actualiza nombre, precio y promoción de las que cambiaron (`conPrecioNuevo`).
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
    carrito.push({ ...l, nombre: p.nombre, precio: p.precio, promocion: p.promocion ?? null });
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
