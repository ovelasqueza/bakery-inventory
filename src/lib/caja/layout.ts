// Medidas de la pantalla de Caja según el tamaño de la ventana. Módulo puro (sin React ni DOM).

/** Rango de ventana soportado. Las entradas fuera de rango se acotan a estos límites. */
export const LIMITES = { anchoMin: 320, anchoMax: 3840, altoMin: 480, altoMax: 2160 };

/** Medidas fijas en píxeles. */
export const MEDIDAS = {
  encabezado: 96,
  barraMovil: 64,
  padding: 16,
  gap: 12,
  tarjetaMin: 120,
  tarjetaMax: 200,
  quiebre: 768,
};

/** Grupo_Acciones dentro del Encabezado_Caja. */
export const ENCABEZADO = {
  botones: 6,
  altoBoton: 48,
  /** Área táctil mínima de cada botón. */
  toqueMin: 44,
  /** Separación entre botones vecinos (Req 1.3). */
  gap: 8,
  /** Padding horizontal del encabezado. */
  margen: { movil: 8, escritorio: 16 },
  /** Ancho máximo de cada botón en pantallas grandes. */
  anchoBotonMax: 200,
  /** Ancho reservado a la izquierda del grupo y separación con él. */
  izquierda: { acciones: 0, reloj: 96, completo: 360 },
  gapIzquierda: 8,
  /** Umbrales de ancho de ventana. */
  conReloj: 480,
  conLogo: 768,
  conTexto: 1280,
};

/** Boton_Cajon_Flotante (esquina inferior izquierda). */
export const CAJON_FLOTANTE = { tamano: 72, margen: 16 };

/** Qué se muestra a la izquierda del Grupo_Acciones con turno abierto. */
export type ParteEncabezado = 'acciones' | 'reloj' | 'completo';

export type LayoutCaja = {
  modo: 'movil' | 'escritorio';
  /** = alto (acotado), alto del contenedor raíz. */
  altoVentana: number;
  columnas: number;
  anchoTarjeta: number;
  /** Escritorio: 30 % del ancho entre 300 y 420. Móvil: el ancho de la ventana. */
  anchoCarrito: number;
  /** Alto − encabezado (− barra inferior en móvil). */
  altoDisponible: number;
  /** floor(0,85 × alto). */
  altoCarritoExpandido: number;
  /** 'acciones' si ancho < 480, 'reloj' si < 768, 'completo' desde 768. */
  encabezado: ParteEncabezado;
  /**
   * min(anchoBotonMax, (ancho − 2×margen − izquierda − gapIzq − 5×gap) / 6);
   * gapIzq = 0 si izquierda = 0.
   */
  anchoBotonAccion: number;
  /** Ícono y texto desde 1280 px de ancho; antes, solo ícono. */
  textoEnAcciones: boolean;
  /** Posición del Boton_Cajon_Flotante y espacio a reservar al final de las zonas con scroll. */
  cajonFlotante: { left: number; bottom: number; tamano: number; reserva: number };
};

const CARRITO_MIN = 300;
const CARRITO_MAX = 420;
const CARRITO_FRACCION = 0.3;
const CARRITO_EXPANDIDO_FRACCION = 0.85;

function clamp(valor: number, min: number, max: number): number {
  if (!Number.isFinite(valor)) return min;
  return Math.min(max, Math.max(min, valor));
}

function parteEncabezado(ancho: number): ParteEncabezado {
  if (ancho < ENCABEZADO.conReloj) return 'acciones';
  if (ancho < ENCABEZADO.conLogo) return 'reloj';
  return 'completo';
}

/** Calcula el layout de Caja para una ventana de `ancho` × `alto` píxeles. */
export function calcularLayout(ancho: number, alto: number): LayoutCaja {
  const a = clamp(ancho, LIMITES.anchoMin, LIMITES.anchoMax);
  const h = clamp(alto, LIMITES.altoMin, LIMITES.altoMax);

  const modo: LayoutCaja['modo'] = a < MEDIDAS.quiebre ? 'movil' : 'escritorio';
  const escritorio = modo === 'escritorio';

  const anchoCarrito = escritorio
    ? clamp(Math.round(CARRITO_FRACCION * a), CARRITO_MIN, CARRITO_MAX)
    : a;

  const anchoCuadricula = (escritorio ? a - anchoCarrito : a) - 2 * MEDIDAS.padding;

  // Menor número de columnas que deja la tarjeta en tarjetaMax o menos (mínimo 2).
  const columnas = Math.max(
    2,
    Math.ceil((anchoCuadricula + MEDIDAS.gap) / (MEDIDAS.tarjetaMax + MEDIDAS.gap)),
  );

  const anchoTarjeta = (anchoCuadricula - MEDIDAS.gap * (columnas - 1)) / columnas;

  // Los botones de acción van dentro del encabezado: no hay fila aparte que restar.
  const altoDisponible = h - MEDIDAS.encabezado - (escritorio ? 0 : MEDIDAS.barraMovil);

  // Grupo_Acciones: lo que queda a la derecha de la parte izquierda del encabezado.
  const encabezado = parteEncabezado(a);
  const margen = escritorio ? ENCABEZADO.margen.escritorio : ENCABEZADO.margen.movil;
  const izquierda = ENCABEZADO.izquierda[encabezado];
  const gapIzquierda = izquierda > 0 ? ENCABEZADO.gapIzquierda : 0;
  const anchoBotonAccion = Math.min(
    ENCABEZADO.anchoBotonMax,
    (a - 2 * margen - izquierda - gapIzquierda - (ENCABEZADO.botones - 1) * ENCABEZADO.gap) /
      ENCABEZADO.botones,
  );

  const cajonFlotante = {
    left: CAJON_FLOTANTE.margen,
    bottom: CAJON_FLOTANTE.margen + (escritorio ? 0 : MEDIDAS.barraMovil),
    tamano: CAJON_FLOTANTE.tamano,
    reserva: CAJON_FLOTANTE.tamano + 2 * CAJON_FLOTANTE.margen,
  };

  return {
    modo,
    altoVentana: h,
    columnas,
    anchoTarjeta,
    anchoCarrito,
    altoDisponible,
    altoCarritoExpandido: Math.floor(CARRITO_EXPANDIDO_FRACCION * h),
    encabezado,
    anchoBotonAccion,
    textoEnAcciones: a >= ENCABEZADO.conTexto,
    cajonFlotante,
  };
}
