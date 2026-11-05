'use client';

// Categorías de gasto: crear, renombrar, activar y desactivar; nombre de 1 a 40 caracteres (Req 14.3, 14.8–14.10, 14.12).

import { actualizarCategoriaGasto, crearCategoriaGasto, listarCategoriasGasto } from '@/lib/api/parametros';
import { ListaEditableSimple } from '@/components/reportes/ListaEditableSimple';

const crear = (nombre: string) => crearCategoriaGasto(nombre);

export function ConfigCategoriasGasto() {
  return (
    <ListaEditableSimple
      titulo="Categorías de gasto"
      etiquetaNueva="Nueva categoría"
      placeholder="Ej: Insumos, Servicios"
      maxNombre={40}
      textoVacio="Todavía no hay categorías de gasto."
      cargar={listarCategoriasGasto}
      crear={crear}
      actualizar={actualizarCategoriaGasto}
    />
  );
}

export default ConfigCategoriasGasto;
