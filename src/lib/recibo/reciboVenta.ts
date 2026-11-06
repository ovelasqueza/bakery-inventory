/** Armado e impresión del tiquete de una venta individual en impresora térmica ESC/POS (80 mm). */
import { detalleVenta, type DetalleVenta } from '@/lib/api/ventas';
import { imprimirEnAgente } from '@/lib/cajon';
import { fechaHora12 } from '@/lib/fechas/bogota';
import { ENCABEZADO_RECIBO } from './config';
import { armarBytes } from './escpos';
import type { ResultadoRecibo } from './imprimir';
import {
  anchoDe,
  dineroRecibo,
  fila,
  recortar,
  separador,
  type Alineacion,
  type Estilo,
  type LineaRecibo,
} from './texto';

function limpio(texto: string): string {
  return texto.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim();
}

function linea(texto: string, estilo: Estilo = 'normal', alineacion: Alineacion = 'izquierda'): LineaRecibo {
  return { texto: recortar(texto, anchoDe(estilo)), estilo, alineacion };
}

function filaDinero(izquierda: string, valor: number, estilo: Estilo = 'normal'): LineaRecibo {
  return { texto: fila(izquierda, dineroRecibo(valor), anchoDe(estilo)), estilo, alineacion: 'izquierda' };
}

export function lineasReciboVenta(datos: DetalleVenta, metodoNombre?: string | null): LineaRecibo[] {
  const { venta, detalles } = datos;
  const lineas: LineaRecibo[] = [
    linea(ENCABEZADO_RECIBO.nombre, 'grande', 'centro'),
    linea(ENCABEZADO_RECIBO.linea2, 'normal', 'centro'),
    linea('Tiquete de venta', 'negrita', 'centro'),
    linea(separador('=')),
    { texto: fila('Fecha:', fechaHora12(venta.creadoEn)), estilo: 'normal', alineacion: 'izquierda' },
  ];

  if (metodoNombre) {
    lineas.push({
      texto: fila('Método de pago:', limpio(metodoNombre)),
      estilo: 'normal',
      alineacion: 'izquierda',
    });
  }

  lineas.push(linea(separador('-')));

  for (const d of detalles) {
    const etiqueta =
      venta.tipo === 'valor' || d.productoId === null
        ? 'Venta por valor'
        : `${d.cantidad} x ${limpio(d.nombreProducto)}`;
    lineas.push(filaDinero(etiqueta, d.subtotal));
  }

  lineas.push(linea(separador('-')));
  lineas.push(filaDinero('TOTAL', venta.total, 'alto'));

  if (venta.esEfectivo) {
    lineas.push(filaDinero('Efectivo recibido', venta.efectivoRecibido));
    lineas.push(filaDinero('Cambio', venta.cambio, 'negrita'));
  }

  lineas.push(linea(separador('=')));
  lineas.push(linea('¡Gracias por su compra!', 'normal', 'centro'));

  return lineas;
}

export function bytesReciboVenta(datos: DetalleVenta, metodoNombre?: string | null): Uint8Array {
  return armarBytes(lineasReciboVenta(datos, metodoNombre));
}

/**
 * Obtiene el detalle de la venta, arma los bytes ESC/POS y los envía al agente local.
 * Solo se ejecuta cuando el cajero elige explícitamente imprimir el tiquete.
 */
export async function imprimirReciboVenta(
  ventaId: string,
  metodoNombre?: string | null
): Promise<ResultadoRecibo> {
  let bytes: Uint8Array;
  try {
    const datos = await detalleVenta(ventaId);
    bytes = bytesReciboVenta(datos, metodoNombre);
  } catch {
    return { ok: false, motivo: 'sin_datos' };
  }
  return imprimirEnAgente(bytes);
}

export function mensajeImpresionVenta(r: ResultadoRecibo): string {
  if (r.ok) return 'Tiquete impreso';
  switch (r.motivo) {
    case 'sin_agente':
      return 'No se pudo imprimir: el agente de la impresora no responde.';
    case 'error': {
      const error = r.mensaje.trim().replace(/\.+$/, '');
      return `No se pudo imprimir: ${error}.`;
    }
    case 'sin_datos':
      return 'No se pudieron leer los datos de la venta para imprimir.';
  }
}
