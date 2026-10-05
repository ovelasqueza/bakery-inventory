import { supabase } from '@/lib/supabase';
import type {
  Inventario,
  InventarioInsert,
  InventarioUpdate,
  InventarioDetalle,
  InventarioDetalleInsert,
  InventarioCompleto,
  ProductoInventario,
  InventarioFactura,
  InventarioFacturaInsert,
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

// Obtener un inventario por ID con sus detalles y facturas
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
      ),
      inventario_facturas (
        *
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
      ),
      inventario_facturas (
        *
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
    
    // Actualizar total considerando facturas
    await actualizarTotalInventarioConFacturas(inventarioId);
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

  // Actualizar total considerando facturas
  await actualizarTotalInventarioConFacturas(inventarioId);
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
      
      // SIEMPRE usar el precio actual del producto (no el guardado)
      const precioActual = p.precio_actual;
      const cantidad = detalle?.cantidad || 0;
      
      // Recalcular subtotal con el precio actual
      let subtotal = 0;
      if (cantidad > 0) {
        if (tipoProducto === 'produccion') {
          subtotal = cantidad * precioActual * (1 - porcentajeProduccion / 100);
        } else if (tipoProducto === 'materia_prima') {
          // Para materia prima, el subtotal se calcula basado en unidades + parcial
          const contenido = p.contenido_por_unidad || 1;
          const unidadesEnteras = Math.floor(cantidad);
          const fraccion = cantidad - unidadesEnteras;
          const parcial = fraccion * contenido;
          subtotal = (unidadesEnteras * precioActual) + ((parcial / contenido) * precioActual);
        } else {
          subtotal = cantidad * precioActual;
        }
        subtotal = Math.round(subtotal * 100) / 100;
      }
      
      return {
        producto_id: p.id,
        nombre: p.nombre,
        tipo_producto: tipoProducto,
        precio_unitario: precioActual, // Siempre precio actual
        contenido_por_unidad: p.contenido_por_unidad || null,
        unidad_medida: p.unidad_medida || null,
        cantidad: cantidad,
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

// ============================================
// FUNCIONES PARA FACTURAS DE INVENTARIO
// ============================================

// Obtener facturas de un inventario
export async function getFacturasInventario(inventarioId: string): Promise<InventarioFactura[]> {
  const { data, error } = await supabase
    .from('inventario_facturas')
    .select('*')
    .eq('inventario_id', inventarioId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error al obtener facturas:', error);
    throw new Error('No se pudieron cargar las facturas');
  }

  return data || [];
}

// Crear una factura
export async function createFacturaInventario(factura: InventarioFacturaInsert): Promise<InventarioFactura> {
  const { data, error } = await supabase
    .from('inventario_facturas')
    .insert([factura])
    .select()
    .single();

  if (error) {
    console.error('Error al crear factura:', error);
    throw new Error('No se pudo crear la factura');
  }

  // Actualizar el total del inventario
  await actualizarTotalInventarioConFacturas(factura.inventario_id);

  return data;
}

// Actualizar una factura
export async function updateFacturaInventario(
  id: string,
  updates: { nombre?: string; valor?: number }
): Promise<InventarioFactura> {
  // Obtener el inventario_id antes de actualizar
  const { data: facturaActual } = await supabase
    .from('inventario_facturas')
    .select('inventario_id')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('inventario_facturas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error al actualizar factura:', error);
    throw new Error('No se pudo actualizar la factura');
  }

  // Actualizar el total del inventario
  if (facturaActual) {
    await actualizarTotalInventarioConFacturas(facturaActual.inventario_id);
  }

  return data;
}

// Eliminar una factura
export async function deleteFacturaInventario(id: string): Promise<void> {
  // Obtener el inventario_id antes de eliminar
  const { data: factura } = await supabase
    .from('inventario_facturas')
    .select('inventario_id')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('inventario_facturas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error al eliminar factura:', error);
    throw new Error('No se pudo eliminar la factura');
  }

  // Actualizar el total del inventario
  if (factura) {
    await actualizarTotalInventarioConFacturas(factura.inventario_id);
  }
}

// Actualizar el total del inventario incluyendo facturas
async function actualizarTotalInventarioConFacturas(inventarioId: string): Promise<void> {
  // Obtener suma de detalles
  const { data: detalles } = await supabase
    .from('inventario_detalles')
    .select('subtotal')
    .eq('inventario_id', inventarioId);

  const totalDetalles = detalles?.reduce((sum, d) => sum + (d.subtotal || 0), 0) || 0;

  // Obtener suma de facturas
  const { data: facturas } = await supabase
    .from('inventario_facturas')
    .select('valor')
    .eq('inventario_id', inventarioId);

  const totalFacturas = facturas?.reduce((sum, f) => sum + (f.valor || 0), 0) || 0;

  // Actualizar el total general
  await supabase
    .from('inventarios')
    .update({ total_general: totalDetalles + totalFacturas })
    .eq('id', inventarioId);
}
