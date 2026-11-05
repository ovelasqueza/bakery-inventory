import { supabase } from '@/lib/supabase';
import { ErrorApp, traducirError } from './errores';

const BUCKET = 'productos';
const TIEMPO_SUBIDA_MS = 30_000;
const TIEMPO_UPDATE_MS = 15_000;

function sinConexion(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Rechaza con un error `TimeoutError` (traducido a `SIN_CONEXION`) si la promesa tarda más de `ms`. */
function conTiempoLimite<T>(promesa: PromiseLike<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => {
      const error = new Error('TimeoutError: la subida tardó demasiado');
      error.name = 'TimeoutError';
      rechazar(error);
    }, ms);
  });
  return Promise.race([Promise.resolve(promesa), limite]).finally(() => clearTimeout(temporizador));
}

/** Borra archivos del bucket sin propagar errores (Req 10.7, 10.8). */
async function borrarSinFallar(paths: string[]): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch {
    // Se ignora: un archivo huérfano no afecta al usuario.
  }
}

async function actualizarImagenPath(productoId: string, path: string | null): Promise<void> {
  let respuesta;
  try {
    respuesta = await supabase
      .from('productos')
      .update({ imagen_path: path })
      .eq('id', productoId)
      .abortSignal(AbortSignal.timeout(TIEMPO_UPDATE_MS));
  } catch (e) {
    throw traducirError(e);
  }
  if (respuesta.error) throw traducirError(respuesta.error, respuesta.status);
}

/**
 * Sube la foto (ya convertida a WebP por `procesarFoto`) con una ruta nueva y la asigna al producto.
 * Si la subida o el `update` fallan, intenta borrar el archivo nuevo y `imagen_path` no cambia (Req 10.8).
 * Si todo sale bien, borra la foto anterior e ignora su error (Req 10.7).
 * @returns la ruta nueva guardada en `imagen_path`.
 */
export async function subirFotoProducto(
  productoId: string,
  archivo: File,
  imagenPathAnterior: string | null,
): Promise<string> {
  if (sinConexion()) throw new ErrorApp('SIN_CONEXION');

  const path = `${productoId}-${Date.now()}.webp`;

  try {
    const { error } = await conTiempoLimite(
      supabase.storage.from(BUCKET).upload(path, archivo, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      }),
      TIEMPO_SUBIDA_MS,
    );
    if (error) throw error;
    await actualizarImagenPath(productoId, path);
  } catch (e) {
    await borrarSinFallar([path]);
    throw traducirError(e);
  }

  if (imagenPathAnterior && imagenPathAnterior !== path) {
    await borrarSinFallar([imagenPathAnterior]);
  }
  return path;
}

/** Quita la foto del producto (`imagen_path = null`) y luego borra el archivo anterior ignorando su error (Req 10.6). */
export async function quitarFotoProducto(
  productoId: string,
  imagenPathAnterior: string | null,
): Promise<void> {
  if (sinConexion()) throw new ErrorApp('SIN_CONEXION');
  await actualizarImagenPath(productoId, null);
  if (imagenPathAnterior) await borrarSinFallar([imagenPathAnterior]);
}

/** URL pública de la foto, o `null` si el producto no tiene foto (Req 10.11). */
export function urlFoto(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
