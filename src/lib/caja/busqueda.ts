// Búsqueda, filtro y orden del catálogo de Caja. Módulo puro (sin React ni Supabase).
import type { Database } from '@/types/database';

type FilaProducto = Database['public']['Tables']['productos']['Row'];

/** Campos de `productos` que deciden si un producto se vende en Caja. */
export type ProductoBD = Pick<FilaProducto, 'activo' | 'tipo_producto' | 'visible_caja'>;

export type ProductoCaja = {
  id: string;
  nombre: string;
  precio: number;
  categoriaId: string | null;
  imagenUrl: string | null;
  orden: number | null;
};

// Se construye con RegExp porque el target ES2017 no acepta \p{...} en literales.
const DIACRITICOS = new RegExp('\\p{M}', 'gu');

/** NFD, sin diacríticos (\p{M}), minúsculas y sin espacios al inicio ni al final. */
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(DIACRITICOS, '').toLowerCase().trim();
}

/**
 * Deja los productos cuyo nombre contiene el texto (normalizado) y que son de la categoría
 * pedida. Con 'todas' entran todas las categorías y los productos sin categoría.
 * Conserva el orden de entrada.
 */
export function filtrarProductos(
  ps: ProductoCaja[],
  texto: string,
  categoriaId: string | 'todas'
): ProductoCaja[] {
  const buscado = normalizarTexto(texto);
  return ps.filter(
    (p) =>
      (categoriaId === 'todas' || p.categoriaId === categoriaId) &&
      (buscado === '' || normalizarTexto(p.nombre).includes(buscado))
  );
}

/** Orden ascendente; sin orden (null) al final; empates por nombre normalizado con localeCompare('es'). */
export function compararProductos(a: ProductoCaja, b: ProductoCaja): number {
  if (a.orden !== b.orden) {
    if (a.orden === null) return 1;
    if (b.orden === null) return -1;
    return a.orden - b.orden;
  }
  return normalizarTexto(a.nombre).localeCompare(normalizarTexto(b.nombre), 'es');
}

/** activo && tipo !== 'materia_prima' && visible_caja */
export function esVendible(p: ProductoBD): boolean {
  return p.activo && p.tipo_producto !== 'materia_prima' && p.visible_caja;
}
