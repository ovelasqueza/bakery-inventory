import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Verificar configuración
const isConfigured = supabaseUrl && 
  supabaseAnonKey && 
  !supabaseAnonKey.includes('tu_anon_key') &&
  supabaseUrl.includes('supabase.co');

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!isConfigured) {
    console.error('⚠️ Supabase NO está configurado correctamente.');
    console.error('URL:', supabaseUrl);
    console.error('Key configurada:', supabaseAnonKey ? 'Sí (pero puede ser placeholder)' : 'No');
    console.error('');
    console.error('Pasos para configurar:');
    console.error('1. Ve a tu proyecto en https://app.supabase.com');
    console.error('2. Ve a Project Settings → API');
    console.error('3. Copia la "anon public" key');
    console.error('4. Edita .env.local y reemplaza "tu_anon_key_aqui" con tu clave real');
    console.error('5. Reinicia el servidor de desarrollo (npm run dev)');
    
    // Retornar cliente placeholder para evitar errores de build
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    console.log('✅ Cliente Supabase inicializado correctamente');
  }

  return supabaseInstance;
}

export const supabase = getSupabaseClient();

// Cliente para uso en Server Components (opcional)
export function createServerSupabaseClient() {
  if (!isConfigured) {
    throw new Error('Las variables de entorno de Supabase no están configuradas');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });
}
