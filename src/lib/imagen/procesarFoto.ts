/**
 * Prepara la foto de un producto en el navegador antes de subirla (Req 10.2–10.5).
 * No recorta ni amplía: reduce la foto para que quepa entera en un lienzo 4:3 (el mismo
 * formato de la tarjeta de la Caja, máximo 600 × 450 px), la centra y rellena el espacio
 * sobrante con blanco. Así la Caja la muestra completa aunque use `object-cover`.
 * Se guarda en WebP; si pesa más de 300 KB baja la calidad (0,8 → 0,7 → 0,6 → 0,5). No cae a JPEG.
 */

export const FOTO = {
  ladoMax: 600,
  /** Proporción ancho / alto del lienzo final (tarjeta de la Caja, `aspect-[4/3]`). */
  proporcion: 4 / 3,
  relleno: '#FFFFFF',
  pesoMaxOriginal: 25 * 1024 * 1024,
  pesoMaxFinal: 300 * 1024,
  calidades: [0.8, 0.7, 0.6, 0.5],
};

export const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

export type Codificador = (lienzo: HTMLCanvasElement, calidad: number) => Promise<Blob | null>;

export type ErrorFoto = 'FORMATO' | 'DANADO' | 'GRANDE' | 'SIN_WEBP' | 'PESADA';

export type ResultadoFoto =
  | { ok: true; archivo: File; calidad: number }
  | { ok: false; error: ErrorFoto };

/** escala = min(1, 600 / max(ancho, alto)); redondea y nunca baja de 1 px. */
export function dimensionesReducidas(ancho: number, alto: number): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  const escala = mayor > 0 ? Math.min(1, FOTO.ladoMax / mayor) : 1;
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

export interface LienzoFoto {
  /** Tamaño del lienzo final, siempre en proporción 4:3. */
  lienzo: { ancho: number; alto: number };
  /** Posición y tamaño de la foto dentro del lienzo (centrada, sin recorte). */
  foto: { x: number; y: number; ancho: number; alto: number };
}

/**
 * Lienzo 4:3 que contiene la foto entera. La foto se reduce (nunca se amplía) para caber
 * en 600 × 450 px; el lienzo es la caja 4:3 más pequeña que la contiene.
 */
export function lienzoCuatroTercios(ancho: number, alto: number): LienzoFoto {
  const altoMax = Math.round(FOTO.ladoMax / FOTO.proporcion);
  const a = Math.max(1, ancho);
  const h = Math.max(1, alto);
  const escala = Math.min(1, FOTO.ladoMax / a, altoMax / h);
  const fotoAncho = Math.max(1, Math.round(a * escala));
  const fotoAlto = Math.max(1, Math.round(h * escala));

  let lienzoAncho: number;
  let lienzoAlto: number;
  if (fotoAncho / fotoAlto >= FOTO.proporcion) {
    lienzoAncho = fotoAncho;
    lienzoAlto = Math.max(fotoAlto, Math.round(fotoAncho / FOTO.proporcion));
  } else {
    lienzoAlto = fotoAlto;
    lienzoAncho = Math.max(fotoAncho, Math.round(fotoAlto * FOTO.proporcion));
  }
  // Fotos diminutas: el lienzo nunca baja de 4 × 3 px.
  lienzoAncho = Math.max(lienzoAncho, 4);
  lienzoAlto = Math.max(lienzoAlto, 3);

  return {
    lienzo: { ancho: lienzoAncho, alto: lienzoAlto },
    foto: {
      x: Math.floor((lienzoAncho - fotoAncho) / 2),
      y: Math.floor((lienzoAlto - fotoAlto) / 2),
      ancho: fotoAncho,
      alto: fotoAlto,
    },
  };
}

/**
 * Núcleo puro del bucle de calidades. `pesos(calidad)` devuelve el peso en bytes del WebP
 * generado con esa calidad, o `null` si el navegador no pudo generar WebP.
 */
export function elegirCalidad(
  pesos: (calidad: number) => number | null,
): { calidad: number } | { error: 'SIN_WEBP' | 'PESADA' } {
  for (const calidad of FOTO.calidades) {
    const peso = pesos(calidad);
    if (peso === null) return { error: 'SIN_WEBP' };
    if (peso <= FOTO.pesoMaxFinal) return { calidad };
  }
  return { error: 'PESADA' };
}

const codificarWebP: Codificador = (lienzo, calidad) =>
  new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, 'image/webp', calidad));

export async function procesarFoto(
  archivo: File,
  deps?: { codificar?: Codificador; decodificar?: typeof createImageBitmap },
): Promise<ResultadoFoto> {
  if (!TIPOS.includes(archivo.type)) return { ok: false, error: 'FORMATO' };
  if (archivo.size > FOTO.pesoMaxOriginal) return { ok: false, error: 'GRANDE' };

  const codificar = deps?.codificar ?? codificarWebP;
  const decodificar = deps?.decodificar ?? createImageBitmap;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation corrige la rotación EXIF de las fotos de celular
    bitmap = await decodificar(archivo, { imageOrientation: 'from-image' });
  } catch {
    return { ok: false, error: 'DANADO' };
  }

  let lienzo: HTMLCanvasElement;
  try {
    const medidas = lienzoCuatroTercios(bitmap.width, bitmap.height);
    lienzo = document.createElement('canvas');
    lienzo.width = medidas.lienzo.ancho;
    lienzo.height = medidas.lienzo.alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return { ok: false, error: 'DANADO' };
    ctx.fillStyle = FOTO.relleno;
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const { x, y, ancho, alto } = medidas.foto;
    ctx.drawImage(bitmap, x, y, ancho, alto);
  } finally {
    bitmap.close();
  }

  // Mismo criterio que elegirCalidad, pero con codificación asíncrona.
  for (const calidad of FOTO.calidades) {
    let blob: Blob | null;
    try {
      blob = await codificar(lienzo, calidad);
    } catch {
      blob = null;
    }
    // Safari antiguo devuelve PNG en lugar de WebP
    if (!blob || blob.type !== 'image/webp') return { ok: false, error: 'SIN_WEBP' };
    if (blob.size <= FOTO.pesoMaxFinal) {
      const base = archivo.name.replace(/\.[^.]+$/, '') || 'foto';
      return { ok: true, archivo: new File([blob], `${base}.webp`, { type: 'image/webp' }), calidad };
    }
  }
  return { ok: false, error: 'PESADA' };
}
