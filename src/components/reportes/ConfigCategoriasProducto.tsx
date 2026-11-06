'use client';

// Categorías de productos: ver disponibles, crear, renombrar, activar y desactivar;
// al desactivar una categoría, los productos que la tengan quedan sin categoría.

import {
  actualizarCategoriaProducto,
  crearCategoriaProducto,
  listarCategoriasProducto,
} from '@/lib/api/parametros';
import { ListaEditableSimple } from '@/components/reportes/ListaEditableSimple';

const crear = (nombre: string) => crearCategoriaProducto(nombre);

interface ConfigCategoriasProductoProps {
  onCambio?: () => void;
}

export function ConfigCategoriasProducto({ onCambio }: ConfigCategoriasProductoProps) {
  return (
    <ListaEditableSimple
      titulo="Categorías de productos"
      etiquetaNueva="Nueva categoría"
      placeholder="Ej: Panes, Pasteles, Bebidas"
      maxNombre={40}
      textoVacio="Todavía no hay categorías de productos."
      nota="Al desactivar una categoría, los productos que la tengan asignada quedan sin categoría automáticamente."
      cargar={listarCategoriasProducto}
      crear={crear}
      actualizar={actualizarCategoriaProducto}
      onCambio={onCambio}
    />
  );
}

export default ConfigCategoriasProducto;
