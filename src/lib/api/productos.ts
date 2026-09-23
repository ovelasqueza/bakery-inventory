import { supabase } from '@/lib/supabase';
import type {
  Producto,
  ProductoInsert,
  ProductoUpdate,
  HistorialPrecio,
} from '@/types/database';

// Obtener todos los productos activos
export async function getProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('activo', true)
    .order('nombre');

  if (error) {
    console.error('Error al obtener productos:', error);
    throw new Error('No se pudieron cargar los productos');
  }

  return data;
}

// Obtener todos los productos (incluyendo inactivos)
export async function getAllProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .order('activo', { ascending: false })
    .order('nombre');

  if (error) {
    console.error('Error al obtener todos los productos:', error);
    throw new Error('No se pudieron cargar los productos');
  }

  return data;
}

// Obtener un producto por ID
export async function getProductoById(id: string): Promise<Producto | null> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // No encontrado
    }
    console.error('Error al obtener producto:', error);
    throw new Error('No se pudo cargar el producto');
  }

  return data;
}

// Crear un nuevo producto
export async function createProducto(producto: ProductoInsert): Promise<Producto> {
  console.log('Creando producto:', producto);
  
  const { data, error } = await supabase
    .from('productos')
    .insert([{
      nombre: producto.nombre,
      precio_actual: producto.precio_actual,
      tipo_producto: producto.tipo_producto || 'normal',
      contenido_por_unidad: producto.contenido_por_unidad || null,
      unidad_medida: producto.unidad_medida || null,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error al crear producto:', error);
    throw new Error(`No se pudo crear el producto: ${error.message}`);
  }

  console.log('Producto creado:', data);

  // Registrar el precio inicial en el historial (solo si tiene precio)
  if (producto.precio_actual && producto.precio_actual > 0) {
    const { error: historialError } = await supabase.from('historial_precios').insert([{
      producto_id: data.id,
      precio_anterior: null,
      precio_nuevo: producto.precio_actual,
    }]);

    if (historialError) {
      console.warn('Error al registrar historial de precio:', historialError);
    }
  }

  return data;
}

// Actualizar un producto existente
export async function updateProducto(
  id: string,
  updates: ProductoUpdate
): Promise<Producto> {
  const { data, error } = await supabase
    .from('productos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error al actualizar producto:', error);
    throw new Error('No se pudo actualizar el producto');
  }

  return data;
}

// Eliminar un producto (soft delete - marcar como inactivo)
export async function deleteProducto(id: string): Promise<void> {
  const { error } = await supabase
    .from('productos')
    .update({ activo: false })
    .eq('id', id);

  if (error) {
    console.error('Error al eliminar producto:', error);
    throw new Error('No se pudo eliminar el producto');
  }
}

// Reactivar un producto
export async function reactivarProducto(id: string): Promise<void> {
  const { error } = await supabase
    .from('productos')
    .update({ activo: true })
    .eq('id', id);

  if (error) {
    console.error('Error al reactivar producto:', error);
    throw new Error('No se pudo reactivar el producto');
  }
}

// Obtener historial de precios de un producto
export async function getHistorialPrecios(productoId: string): Promise<HistorialPrecio[]> {
  const { data, error } = await supabase
    .from('historial_precios')
    .select('*')
    .eq('producto_id', productoId)
    .order('fecha_cambio', { ascending: false });

  if (error) {
    console.error('Error al obtener historial de precios:', error);
    throw new Error('No se pudo cargar el historial de precios');
  }

  return data;
}

// Buscar productos por nombre
export async function searchProductos(query: string): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('activo', true)
    .ilike('nombre', `%${query}%`)
    .order('nombre')
    .limit(20);

  if (error) {
    console.error('Error al buscar productos:', error);
    throw new Error('No se pudieron buscar los productos');
  }

  return data;
}
