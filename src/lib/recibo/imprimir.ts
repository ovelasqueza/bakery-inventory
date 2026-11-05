import { datosReciboCierre } from '../api/recibo';
import { imprimirEnAgente, type ResultadoImpresion } from '../cajon';
import { bytesReciboCierre } from './reciboCierre';

/** Resultado de imprimir el Recibo_Cierre: el del agente o `sin_datos` si no se leyeron los datos. */
export type ResultadoRecibo = ResultadoImpresion | { ok: false; motivo: 'sin_datos' };

const TURNO_CERRADO = 'El turno sí quedó cerrado.';

/**
 * Pide los Datos_Recibo del turno, arma los bytes ESC/POS y los manda al agente.
 * Nunca lanza: cualquier fallo al leer o armar los datos es `sin_datos`.
 */
export async function imprimirReciboCierre(turnoId: string, ahora = new Date()): Promise<ResultadoRecibo> {
  let bytes: Uint8Array;
  try {
    const datos = await datosReciboCierre(turnoId);
    bytes = bytesReciboCierre(datos, ahora);
  } catch {
    return { ok: false, motivo: 'sin_datos' };
  }
  return imprimirEnAgente(bytes);
}

/** Texto para la Pantalla_Resultado o el toast (Req 5.5-5.8). Pura. */
export function mensajeImpresion(r: ResultadoRecibo): string {
  if (r.ok) return 'Recibo impreso';
  switch (r.motivo) {
    case 'sin_agente':
      return `No se pudo imprimir: el agente de la impresora no responde. ${TURNO_CERRADO}`;
    case 'error': {
      const error = r.mensaje.trim().replace(/\.+$/, '');
      return `No se pudo imprimir: ${error}. ${TURNO_CERRADO}`;
    }
    case 'sin_datos':
      return `No se pudieron leer los datos del recibo. ${TURNO_CERRADO}`;
  }
}
