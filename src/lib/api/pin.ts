import { llamarRpc } from '@/lib/api/errores';

/** Tiempo límite para verificar el PIN_Admin (Req 15.8). */
const TIEMPO_VERIFICAR_MS = 10_000;

/** `true` si hay un PIN_Admin guardado (Req 15.1). */
export async function pinConfigurado(): Promise<boolean> {
  const data = await llamarRpc<boolean>('pin_admin_configurado', {});
  return data === true;
}

/**
 * Compara el PIN con el hash guardado en el servidor (Req 15.4, 15.5).
 * Sin PIN configurado el servidor responde `true`. Si no hay respuesta en 10 s
 * lanza `ErrorApp('SIN_CONEXION')` y no cuenta como intento fallido (Req 15.8).
 */
export async function verificarPin(pin: string): Promise<boolean> {
  const data = await llamarRpc<boolean>('verificar_pin_admin', { p_pin: pin }, TIEMPO_VERIFICAR_MS);
  return data === true;
}

/**
 * Establece, cambia o quita (`nuevo = null`) el PIN_Admin (Req 15.9).
 * Lanza `PIN_INCORRECTO` si `actual` no coincide con el PIN guardado y
 * `PIN_INVALIDO` si `nuevo` no tiene de 4 a 8 dígitos.
 */
export async function cambiarPin(actual: string | null, nuevo: string | null): Promise<void> {
  await llamarRpc<null>('cambiar_pin_admin', { p_actual: actual, p_nuevo: nuevo });
}
