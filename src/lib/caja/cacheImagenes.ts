'use client';

/**
 * Caché persistente (Cache Storage + RAM en memoria) para fotos de productos de Supabase
 * e imágenes de billetes/monedas.
 *
 * - La primera vez que se pide una imagen, la busca en `CacheStorage` ('lizpan-imagenes-v1').
 * - Si no está en `CacheStorage`, la descarga UNA sola vez por red, la guarda en `CacheStorage`
 *   y crea un `blob:` URL en memoria RAM.
 * - Todas las lecturas siguientes durante el turno (cambio de categoría, abrir/cerrar cobro,
 *   recargar la página) usan la copia local sin hacer ninguna petición a Supabase.
 */

const NOMBRE_CACHE = 'lizpan-imagenes-v1';

/** URL original → blob URL en memoria RAM (instantáneo, 0 ms). */
const memoriaBlobUrl = new Map<string, string>();
/** Promesas en vuelo para no descargar dos veces la misma URL al mismo tiempo. */
const enVuelo = new Map<string, Promise<string>>();

const BILLETES_Y_MONEDAS = [
  '/billetes/2000_new.webp',
  '/billetes/5000_new.webp',
  '/billetes/10000_new.webp',
  '/billetes/20000_new.webp',
  '/billetes/50000_new.webp',
  '/billetes/100000_new.webp',
  '/billetes/moneda-50.webp',
  '/billetes/moneda-100.webp',
  '/billetes/moneda-200.webp',
  '/billetes/moneda-500.webp',
  '/billetes/moneda-1000.webp',
];

let billetesPrecargados = false;

/** Devuelve el blob URL en memoria si ya está listo, o `null` si aún no se ha resuelto. */
export function obtenerUrlEnMemoria(url: string | null | undefined): string | null {
  if (!url) return null;
  return memoriaBlobUrl.get(url) ?? null;
}

/**
 * Obtiene una URL local (`blob:...`) para `url`, usando primero la memoria RAM,
 * luego `CacheStorage` del navegador y solo si no existe hace 1 petición de red.
 */
export async function obtenerImagenCacheada(url: string): Promise<string> {
  const enRam = memoriaBlobUrl.get(url);
  if (enRam) return enRam;

  const existente = enVuelo.get(url);
  if (existente) return existente;

  const promesa = (async () => {
    try {
      if (typeof window === 'undefined' || typeof fetch !== 'function') {
        return url;
      }

      let respuesta: Response | undefined;
      const tieneCacheApi = 'caches' in window;

      if (tieneCacheApi) {
        try {
          const cache = await window.caches.open(NOMBRE_CACHE);
          respuesta = await cache.match(url);
          if (!respuesta) {
            const red = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (red.ok) {
              try {
                await cache.put(url, red.clone());
              } catch {
                // Si el almacenamiento está lleno, igual usamos la respuesta en RAM.
              }
              respuesta = red;
            }
          }
        } catch {
          // Si CacheStorage no está disponible, cae al fetch normal.
        }
      }

      if (!respuesta) {
        const red = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!red.ok) return url;
        respuesta = red;
      }

      const blob = await respuesta.blob();
      if (blob.size === 0) return url;
      const blobUrl = URL.createObjectURL(blob);
      memoriaBlobUrl.set(url, blobUrl);
      return blobUrl;
    } catch {
      return url;
    } finally {
      enVuelo.delete(url);
    }
  })();

  enVuelo.set(url, promesa);
  return promesa;
}

/** Precarga en segundo plano todas las imágenes de billetes y monedas una sola vez. */
export function precargarBilletesYMonedas(): void {
  if (billetesPrecargados || typeof window === 'undefined') return;
  billetesPrecargados = true;
  for (const ruta of BILLETES_Y_MONEDAS) {
    void obtenerImagenCacheada(ruta);
  }
}

/** Precarga en segundo plano las fotos de todos los productos del catálogo una sola vez. */
export function precargarFotosProductos(urls: (string | null | undefined)[]): void {
  if (typeof window === 'undefined') return;
  for (const url of urls) {
    if (url && !memoriaBlobUrl.has(url) && !enVuelo.has(url)) {
      void obtenerImagenCacheada(url);
    }
  }
}
