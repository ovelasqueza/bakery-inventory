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

/**
 * Grupo_Acciones dentro del Encabezado_Caja. Los botones siempre llevan ícono y nombre:
 * si no hay espacio, primero se quita el logo, luego el reloj y al final se pasan a 2 filas de 3.
 */
export const ENCABEZADO = {
  botones: 7,
  /** Alto de cada botón con una sola fila (encabezado de 96 px). */
  altoBoton: 64,
  /** Alto de cada botón con 2 filas. */
  altoBotonDosFilas: 52,
  /** Área táctil mínima de cada botón. */
  toqueMin: 44,
  /** Separación entre botones vecinos (Req 1.3). */
  gap: 8,
  /** Separación entre las 2 filas y margen vertical del encabezado con 2 filas. */
  gapFilas: 6,
  margenVerticalDosFilas: 8,
  /** Padding horizontal del encabezado. */
  margen: { movil: 8, escritorio: 16 },
  /** Ancho máximo de cada botón en pantallas grandes. */
  anchoBotonMax: 200,
  /** Ancho reservado a la izquierda del grupo y separación con él. */
  izquierda: { acciones: 0, reloj: 96, completo: 360 },
  gapIzquierda: 8,
  /** Ancho mínimo de botón para el ícono al lado del nombre (también para mostrar el logo). */
  anchoEnLinea: 136,
  /** Ancho mínimo de botón para el ícono encima del nombre. */
  anchoApilado: 84,
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
  /** Alto − encabezado con turno (− barra inferior en móvil). */
  altoDisponible: number;
  /** floor(0,85 × alto). */
  altoCarritoExpandido: number;
  /**
   * Lo que va a la izquierda del Grupo_Acciones con turno: 'completo' (logo + reloj) si los
   * botones quedan de anchoEnLinea o más; si no, 'reloj' si quedan de anchoApilado o más;
   * si no, 'acciones'.
   */
  encabezado: ParteEncabezado;
  /** 1 fila de 6, o 2 filas de 3 cuando ni sin reloj caben de anchoApilado. */
  filasAcciones: 1 | 2;
  /** min(anchoBotonMax, (ancho − 2×margen − izquierda − gapIzq − (porFila−1)×gap) / porFila). */
  anchoBotonAccion: number;
  altoBotonAccion: number;
  /** 'en-linea': ícono al lado del nombre; 'apilada': ícono encima del nombre. */
  etiquetaAcciones: 'en-linea' | 'apilada';
  /** Alto del Encabezado_Caja con turno: 96 con 1 fila, más alto con 2 filas. */
  altoEncabezado: number;
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

/** Ancho de cada Boton_Accion con la parte izquierda dada y `porFila` botones por fila. */
function anchoBoton(ancho: number, margen: number, parte: ParteEncabezado, porFila: number): number {
  const izquierda = ENCABEZADO.izquierda[parte];
  const gapIzquierda = izquierda > 0 ? ENCABEZADO.gapIzquierda : 0;
  return Math.min(
    ENCABEZADO.anchoBotonMax,
    (ancho - 2 * margen - izquierda - gapIzquierda - (porFila - 1) * ENCABEZADO.gap) / porFila,
  );
}

/** Reparto del encabezado con turno: los nombres de los botones tienen prioridad sobre logo y reloj. */
function repartoEncabezado(ancho: number, margen: number) {
  const seis = ENCABEZADO.botones;
  const completo = anchoBoton(ancho, margen, 'completo', seis);
  if (completo >= ENCABEZADO.anchoEnLinea) {
    return { parte: 'completo' as const, filas: 1 as const, ancho: completo };
  }
  const reloj = anchoBoton(ancho, margen, 'reloj', seis);
  if (reloj >= ENCABEZADO.anchoApilado) return { parte: 'reloj' as const, filas: 1 as const, ancho: reloj };
  const solo = anchoBoton(ancho, margen, 'acciones', seis);
  if (solo >= ENCABEZADO.anchoApilado) return { parte: 'acciones' as const, filas: 1 as const, ancho: solo };
  return {
    parte: 'acciones' as const,
    filas: 2 as const,
    ancho: anchoBoton(ancho, margen, 'acciones', Math.ceil(seis / 2)),
  };
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

  // Grupo_Acciones: lo que queda a la derecha de la parte izquierda del encabezado.
  const margen = escritorio ? ENCABEZADO.margen.escritorio : ENCABEZADO.margen.movil;
  const reparto = repartoEncabezado(a, margen);
  const dosFilas = reparto.filas === 2;
  const altoBotonAccion = dosFilas ? ENCABEZADO.altoBotonDosFilas : ENCABEZADO.altoBoton;
  const altoEncabezado = dosFilas
    ? 2 * ENCABEZADO.altoBotonDosFilas + ENCABEZADO.gapFilas + 2 * ENCABEZADO.margenVerticalDosFilas
    : MEDIDAS.encabezado;

  // Los botones de acción van dentro del encabezado: no hay fila aparte que restar.
  const altoDisponible = h - altoEncabezado - (escritorio ? 0 : MEDIDAS.barraMovil);

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
    encabezado: reparto.parte,
    filasAcciones: reparto.filas,
    anchoBotonAccion: reparto.ancho,
    altoBotonAccion,
    etiquetaAcciones: reparto.ancho >= ENCABEZADO.anchoEnLinea ? 'en-linea' : 'apilada',
    altoEncabezado,
    cajonFlotante,
  };
}
