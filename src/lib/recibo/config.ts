/** Textos y medidas del recibo de cierre de turno (fáciles de cambiar). */

export const ENCABEZADO_RECIBO = {
  nombre: 'PANADERIA LIZPAN',
  nit: 'NIT 1144209114-4',
  linea2: 'Barrio Los Alcázares',
  titulo: 'Cierre de turno',
};

/** Columnas con la fuente A en papel de 80 mm. */
export const COLUMNAS = 48;
/** Columnas con doble ancho. */
export const COLUMNAS_DOBLE = 24;
/** En base64 da 65.536, el límite que acepta el agente del cajón. */
export const MAX_BYTES_RECIBO = 49_152;
/** ESC t 2 = PC850. */
export const PAGINA_CODIGOS = 2;
