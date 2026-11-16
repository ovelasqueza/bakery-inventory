import { datosReciboCierre } from '../api/recibo';
import { imprimirEnAgente, type ResultadoImpresion } from '../cajon';
import { diaLocal } from '../fechas/bogota';
import { bytesReciboCierre } from './reciboCierre';
import { esHoraResumenMariela, imprimirReciboMariela } from './reciboDiaMariela';

/** Resultado de imprimir el Recibo_Cierre: el del agente o `sin_datos` si no se leyeron los datos. */
export type ResultadoRecibo = ResultadoImpresion | { ok: false; motivo: 'sin_datos' };

const TURNO_CERRADO = 'El turno sí quedó cerrado.';

/**
 * Pide los Datos_Recibo del turno, arma los bytes ESC/POS y los manda al agente.
 * Si el cierre ocurre entre las 7:00 pm y las 10:59 pm (hora Bogotá), imprime también
 * el segundo tiquete con el resumen del día "PARA DOÑA MARIELA".
 * Nunca lanza: cualquier fallo al leer o armar los datos es `sin_datos`.
 */
export async function imprimirReciboCierre(turnoId: string, ahora = new Date()): Promise<ResultadoRecibo> {
  let bytes: Uint8Array;
  let cerradoEn: string | Date = ahora;
  try {
    const datos = await datosReciboCierre(turnoId);
    cerradoEn = datos.turno.cerradoEn || ahora;
    bytes = bytesReciboCierre(datos, ahora);
  } catch {
    return { ok: false, motivo: 'sin_datos' };
  }
  const resTurno = await imprimirEnAgente(bytes);
  if (resTurno.ok && esHoraResumenMariela(cerradoEn)) {
    await imprimirReciboMariela(diaLocal(cerradoEn), ahora).catch(() => undefined);
  }
  return resTurno;
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
