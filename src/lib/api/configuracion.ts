import { supabase } from '@/lib/supabase';
import type { Configuracion } from '@/types/database';

// Obtener todas las configuraciones
export async function getConfiguraciones(): Promise<Configuracion[]> {
  const { data, error } = await supabase
    .from('configuracion')
    .select('*')
    .order('clave');

  if (error) {
    console.error('Error al obtener configuraciones:', error);
    return [];
  }

  return data || [];
}

// Obtener una configuración por clave
export async function getConfiguracion(clave: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', clave)
    .single();

  if (error) {
    console.error('Error al obtener configuración:', error);
    return null;
  }

  return data?.valor || null;
}

// Obtener el porcentaje de descuento de producción
export async function getPorcentajeProduccion(): Promise<number> {
  const valor = await getConfiguracion('porcentaje_descuento_produccion');
  return valor ? parseFloat(valor) : 15; // Default 15%
}

// Actualizar una configuración
export async function updateConfiguracion(clave: string, valor: string): Promise<boolean> {
  const { error } = await supabase
    .from('configuracion')
    .update({ valor })
    .eq('clave', clave);

  if (error) {
    console.error('Error al actualizar configuración:', error);
    return false;
  }

  return true;
}
