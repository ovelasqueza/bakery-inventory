import { supabase } from '@/lib/supabase';
import type {
  Inventario,
  InventarioInsert,
  InventarioUpdate,
  InventarioDetalle,
  InventarioDetalleInsert,
  InventarioCompleto,
  ProductoInventario,
} from '@/types/database';
import { getProductos } from './productos';

// Obtener todos los inventarios
export async function getInventarios(): Promise<Inventario[]> {
  const { data, error } = await supabase
    .from('inventarios')
    .select('*')
    .order('fecha_inventario', { ascending: false });

  if (error) {
    console.error('Error al obtener inventarios:', error);
    throw new Error('No se pudieron cargar los inventarios');
  }

  return data;
}

// Obtener un inventario por ID con sus detalles
export async function getInventarioById(id: string): Promise<InventarioCompleto | null> {
  const { data, error } = await supabase
    .from('inventarios')
    .select(`
      *,
      inventario_detalles (
        *,
        productos (
          id,
          nombre
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error al obtener inventario:', error);
    throw new Error('No se pudo cargar el inventario');
  }

  return data as InventarioCompleto;
}

// Obtener inventario por fecha
export async function getInventarioByFecha(fecha: string): Promise<InventarioCompleto | null> {
  const { data, error } = await supabase
    .from('inventarios')
    .select(`
      *,
      inventario_detalles (
        *,
        productos (
          id,
          nombre
        )
      )
    `)
    .eq('fecha_inventario', fecha)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error al obtener inventario por fecha:', error);
    throw new Error('No se pudo cargar el inventario');
  }

  return data as InventarioCompleto;
}

// Crear un nuevo inventario
export async function createInventario(inventario: InventarioInsert): Promise<Inventario> {
  const { data, error } = await supabase
    .from('inventarios')
    .insert([inventario])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya existe un inventario para esta fecha');
    }
    console.error('Error al crear inventario:', error);
    throw new Error('No se pudo crear el inventario');
  }

  return data;
}

// Actualizar un inventario
export async function updateInventario(
  id: string,
  updates: InventarioUpdate
): Promise<Inventario> {
  const { data, error } = await supabase
    .from('inventarios')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error al actualizar inventario:', error);
    throw new Error('No se pudo actualizar el inventario');
  }

  return data;
}

// Eliminar un inventario
export async function deleteInventario(id: string): Promise<void> {
  const { error } = await supabase.from('inventarios').delete().eq('id', id);

  if (error) {
    console.error('Error al eliminar inventario:', error);
    throw new Error('No se pudo eliminar el inventario');
  }
}

// Guardar o actualizar detalle de inventario
export async function upsertInventarioDetalle(
  detalle: InventarioDetalleInsert
): Promise<InventarioDetalle> {
  const { data, error } = await supabase
    .from('inventario_detalles')
    .upsert([detalle], {
      onConflict: 'inventario_id,producto_id',
    })
    .select()
    .single();

  if (error) {
    console.error('Error al guardar detalle de inventario:', error);
    throw new Error('No se pudo guardar el detalle');
  }

  return data;
}

// Guardar múltiples detalles de inventario
export async function saveInventarioDetalles(
  inventarioId: string,
  detalles: Array<{
    producto_id: string;
    cantidad: number;
    precio_unitario_aplicado: number;
    subtotal: number; // El subtotal ya calculado (con descuento aplicado si corresponde)
  }>
): Promise<void> {
  // Filtrar solo los productos con cantidad > 0 o subtotal > 0
  const detallesAGuardar = detalles
    .filter((d) => d.cantidad > 0 || d.subtotal > 0)
    .map((d) => ({
      inventario_id: inventarioId,
      producto_id: d.producto_id,
      cantidad: d.cantidad,
      precio_unitario_aplicado: d.precio_unitario_aplicado,
      subtotal: d.subtotal, // Guardar el subtotal real (con descuento si aplica)
    }));

  if (detallesAGuardar.length === 0) {
    // Eliminar todos los detalles existentes si no hay nada que guardar
    await supabase
      .from('inventario_detalles')
      .delete()
      .eq('inventario_id', inventarioId);
    
    // Actualizar total a 0
    await supabase
      .from('inventarios')
      .update({ total_general: 0 })
      .eq('id', inventarioId);
    return;
  }

  // Primero eliminar los detalles existentes
  await supabase
    .from('inventario_detalles')
    .delete()
    .eq('inventario_id', inventarioId);

  // Luego insertar los nuevos con el subtotal correcto
  const { error } = await supabase
    .from('inventario_detalles')
    .insert(detallesAGuardar);

  if (error) {
    console.error('Error al guardar detalles de inventario:', error);
    throw new Error('No se pudieron guardar los detalles del inventario');
  }

  // Calcular el total usando los subtotales ya calculados (que incluyen descuentos)
  const totalGeneral = detallesAGuardar.reduce((acc, d) => acc + d.subtotal, 0);

  await supabase
    .from('inventarios')
    .update({ total_general: totalGeneral })
    .eq('id', inventarioId);
}

// Eliminar un detalle de inventario
export async function deleteInventarioDetalle(id: string): Promise<void> {
  const { error } = await supabase
    .from('inventario_detalles')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error al eliminar detalle de inventario:', error);
    throw new Error('No se pudo eliminar el detalle');
  }
}

// Inicializar un nuevo inventario con todos los productos
export async function inicializarInventario(fecha: string): Promise<{
  inventario: Inventario;
  productos: ProductoInventario[];
  porcentajeProduccion: number;
}> {
  // Obtener el porcentaje de descuento para producción
  const { data: configData } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'porcentaje_descuento_produccion')
    .single();
  
  const porcentajeProduccion = configData ? parseFloat(configData.valor) : 15;

  // Verificar si ya existe un inventario para esta fecha
  const existente = await getInventarioByFecha(fecha);
  
  if (existente) {
    // Cargar los productos con las cantidades existentes
    const productos = await getProductos();
    const detallesMap = new Map(
      existente.inventario_detalles?.map((d) => [d.producto_id, d]) || []
    );

    const productosInventario: ProductoInventario[] = productos.map((p) => {
      const detalle = detallesMap.get(p.id);
      const tipoProducto = (p.tipo_producto as 'normal' | 'produccion' | 'materia_prima') || 'normal';
      
      // Usar el subtotal guardado si existe, sino calcularlo
      let subtotal = detalle?.subtotal || 0;
      if (!subtotal && detalle) {
        // Si no hay subtotal guardado, recalcular
        if (tipoProducto === 'produccion') {
          subtotal = detalle.cantidad * detalle.precio_unitario_aplicado * (1 - porcentajeProduccion / 100);
        } else {
          subtotal = detalle.cantidad * detalle.precio_unitario_aplicado;
        }
      }
      
      return {
        producto_id: p.id,
        nombre: p.nombre,
        tipo_producto: tipoProducto,
        precio_unitario: detalle?.precio_unitario_aplicado || p.precio_actual,
        contenido_por_unidad: p.contenido_por_unidad || null,
        unidad_medida: p.unidad_medida || null,
        cantidad: detalle?.cantidad || 0,
        subtotal: subtotal,
      };
    });

    return {
      inventario: existente,
      productos: productosInventario,
      porcentajeProduccion,
    };
  }

  // Crear nuevo inventario
  const nuevoInventario = await createInventario({
    fecha_inventario: fecha,
    estado: 'en_proceso',
  });

  // Cargar todos los productos activos
  const productos = await getProductos();
  const productosInventario: ProductoInventario[] = productos.map((p) => {
    const tipoProducto = (p.tipo_producto as 'normal' | 'produccion' | 'materia_prima') || 'normal';
    return {
      producto_id: p.id,
      nombre: p.nombre,
      tipo_producto: tipoProducto,
      precio_unitario: p.precio_actual,
      contenido_por_unidad: p.contenido_por_unidad || null,
      unidad_medida: p.unidad_medida || null,
      cantidad: 0,
      subtotal: 0,
    };
  });

  return {
    inventario: nuevoInventario,
    productos: productosInventario,
    porcentajeProduccion,
  };
}

// Finalizar un inventario (marcar como completado)
export async function finalizarInventario(id: string): Promise<Inventario> {
  return updateInventario(id, { estado: 'completado' });
}

// Reabrir un inventario completado para edición
export async function reabrirInventario(id: string): Promise<Inventario> {
  return updateInventario(id, { estado: 'en_proceso' });
}
