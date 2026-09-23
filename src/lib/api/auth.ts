import { supabase } from '@/lib/supabase';

const AUTH_TOKEN_KEY = 'bakery_auth_token';
const AUTH_EXPIRY_KEY = 'bakery_auth_expiry';
const SESSION_DURATION_HOURS = 24; // Sesión válida por 24 horas

/**
 * Verifica la contraseña contra la función de Supabase
 */
export async function verificarPassword(password: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('verificar_password', {
      password_intento: password,
    });

    if (error) {
      console.error('Error al verificar contraseña:', error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error('Error de conexión:', error);
    return false;
  }
}

/**
 * Genera un token simple basado en timestamp
 */
function generarToken(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

/**
 * Inicia sesión: verifica contraseña y guarda token
 */
export async function login(password: string): Promise<{ success: boolean; error?: string }> {
  const esValida = await verificarPassword(password);

  if (!esValida) {
    return { success: false, error: 'Contraseña incorrecta' };
  }

  // Guardar token y expiración
  const token = generarToken();
  const expiry = Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000;

  if (typeof window !== 'undefined') {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_EXPIRY_KEY, expiry.toString());
  }

  return { success: true };
}

/**
 * Cierra la sesión eliminando el token
 */
export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EXPIRY_KEY);
  }
}

/**
 * Verifica si hay una sesión activa válida
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const expiryStr = localStorage.getItem(AUTH_EXPIRY_KEY);

  if (!token || !expiryStr) {
    return false;
  }

  const expiry = parseInt(expiryStr, 10);
  const ahora = Date.now();

  // Verificar si el token expiró
  if (ahora > expiry) {
    logout(); // Limpiar tokens expirados
    return false;
  }

  return true;
}

/**
 * Obtiene el tiempo restante de sesión en minutos
 */
export function getSessionTimeRemaining(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const expiryStr = localStorage.getItem(AUTH_EXPIRY_KEY);
  if (!expiryStr) {
    return 0;
  }

  const expiry = parseInt(expiryStr, 10);
  const ahora = Date.now();
  const remaining = expiry - ahora;

  return Math.max(0, Math.floor(remaining / (60 * 1000)));
}

/**
 * Extiende la sesión actual por otras 24 horas
 */
export function extendSession(): void {
  if (typeof window === 'undefined' || !isAuthenticated()) {
    return;
  }

  const expiry = Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000;
  localStorage.setItem(AUTH_EXPIRY_KEY, expiry.toString());
}
