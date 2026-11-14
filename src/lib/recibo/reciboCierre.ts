/** Armado del Recibo_Cierre: Datos_Recibo → Lineas_Recibo → bytes ESC/POS. Módulo puro. */
import type { DatosRecibo } from '../api/recibo';
import { diaLocal, fechaHora12, hora12 } from '../fechas/bogota';
import { ENCABEZADO_RECIBO, MAX_BYTES_RECIBO } from './config';
import { armarBytes } from './escpos';
import { bytesLogoEscPos } from './logo';
import {
  anchoDe,
  dineroRecibo,
  fila,
  recortar,
  separador,
  textoDiferencia,
  type Alineacion,
  type Estilo,
  type LineaRecibo,
} from './texto';

/** Máximo de filas por lista antes de "... y K más". */
export interface LimitesRecibo {
  gastos: number;
  productos: number;
}

export const SIN_MOVIMIENTOS = 'Sin movimientos';
export const AVISO_AUTOCONSUMO = 'Valor de referencia, no es dinero';
export const SUFIJO_CAJA_MAYOR = ' (Caja mayor)';
export const SIN_DATO = '-';

const SIN_LIMITE: LimitesRecibo = { gastos: Infinity, productos: Infinity };

function largo(texto: string): number {
  return Array.from(texto.normalize('NFC')).length;
}

/** Quita saltos de línea y caracteres de control que llegan en nombres y conceptos. */
function limpio(texto: string): string {
  return texto.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim();
}

function linea(texto: string, estilo: Estilo = 'normal', alineacion: Alineacion = 'izquierda'): LineaRecibo {
  return { texto: recortar(texto, anchoDe(estilo)), estilo, alineacion };
}

function salto(): LineaRecibo {
  return { texto: '', estilo: 'normal', alineacion: 'izquierda' };
}

function filaDinero(izquierda: string, valor: number, estilo: Estilo = 'normal'): LineaRecibo {
  return { texto: fila(izquierda, dineroRecibo(valor), anchoDe(estilo)), estilo, alineacion: 'izquierda' };
}

function titulo(texto: string): LineaRecibo {
  return linea(texto, 'alto');
}

function lineaRecorte(omitidos: number): LineaRecibo {
  return linea(`... y ${omitidos} más`);
}

/** Cantidad sin decimales si es entera; si no, hasta 2 decimales con coma. */
function textoCantidad(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

function encabezado(): LineaRecibo[] {
  return [
    linea(ENCABEZADO_RECIBO.nombre, 'grande', 'centro'),
    linea(ENCABEZADO_RECIBO.nit, 'normal', 'centro'),
    linea(ENCABEZADO_RECIBO.linea2, 'normal', 'centro'),
    linea(ENCABEZADO_RECIBO.titulo, 'negrita', 'centro'),
    linea(separador('=')),
  ];
}

function datosTurno(t: DatosRecibo['turno'], ahora: Date): LineaRecibo[] {
  const fecha = diaLocal(t.cerradoEn);
  return [
    linea(`Fecha: ${fecha}`),
    linea(`Abrió: ${limpio(t.abiertoPor)}`),
    { texto: fila(`Cerró: ${limpio(t.cerradoPor)}`, hora12(t.cerradoEn)), estilo: 'normal', alineacion: 'izquierda' },
    { texto: fila('Impreso:', fechaHora12(ahora)), estilo: 'normal', alineacion: 'izquierda' },
  ];
}

function seccionVentas(v: DatosRecibo['ventas']): LineaRecibo[] {
  const filas: LineaRecibo[] = [titulo('VENTAS')];
  if (v.porMetodo.length === 0) {
    filas.push(linea(SIN_MOVIMIENTOS));
  } else {
    for (const m of v.porMetodo) {
      filas.push(filaDinero(limpio(m.nombre), m.total));
    }
  }
  filas.push(filaDinero('TOTAL VENTAS', v.total, 'negrita'));
  return filas;
}

/** Filas "cantidad nombre ... $ valor" con las cantidades alineadas, o "Sin movimientos". */
function filasProductos(lista: DatosRecibo['productos'], limite: number): LineaRecibo[] {
  if (lista.length === 0) return [linea(SIN_MOVIMIENTOS)];
  const mostrados = lista.slice(0, limite);
  const cantidades = mostrados.map((p) => textoCantidad(p.cantidad));
  const ancho = Math.max(0, ...cantidades.map(largo));
  const filas = mostrados.map((p, i) =>
    filaDinero(`${cantidades[i].padStart(ancho)} ${limpio(p.nombre)}`, p.valor),
  );
  if (mostrados.length < lista.length) filas.push(lineaRecorte(lista.length - mostrados.length));
  return filas;
}

function suma(lista: { valor: number }[]): number {
  return lista.reduce((s, x) => s + x.valor, 0);
}

function seccionProductos(lista: DatosRecibo['productos'], limite: number): LineaRecibo[] {
  return [
    titulo('RESUMEN DE PRODUCTOS'),
    ...filasProductos(lista, limite),
    filaDinero('Total productos', suma(lista), 'negrita'),
  ];
}

function esValeGasto(g: DatosRecibo['gastos']['lista'][number]): boolean {
  const cat = limpio(g.categoria).toLowerCase();
  const conc = limpio(g.concepto).toLowerCase();
  return cat.includes('vale') || conc.startsWith('vale (') || conc.startsWith('vale:');
}

function filaGasto(g: DatosRecibo['gastos']['lista'][number]): LineaRecibo {
  const valor = dineroRecibo(g.valor);
  const rawNombre = limpio(g.concepto) || limpio(g.categoria);
  const nombre =
    esValeGasto(g) && !rawNombre.toLowerCase().startsWith('vale') ? `Vale: ${rawNombre}` : rawNombre;
  const sufijo = g.cajon === 0 ? SUFIJO_CAJA_MAYOR : '';
  const disponible = Math.max(0, anchoDe('normal') - largo(valor) - 1 - largo(sufijo));
  return { texto: fila(recortar(nombre, disponible) + sufijo, valor), estilo: 'normal', alineacion: 'izquierda' };
}

function seccionGastos(g: DatosRecibo['gastos'], limite: number): LineaRecibo[] {
  const filas: LineaRecibo[] = [titulo('GASTOS DEL TURNO')];
  if (g.lista.length === 0) filas.push(linea(SIN_MOVIMIENTOS));
  const mostrados = g.lista.slice(0, limite);
  filas.push(...mostrados.map(filaGasto));
  if (mostrados.length < g.lista.length) filas.push(lineaRecorte(g.lista.length - mostrados.length));

  const totalVales = g.lista.reduce((s, item) => (esValeGasto(item) ? s + item.valor : s), 0);
  if (totalVales > 0) {
    const totalOtrosGastos = Math.max(0, g.total - totalVales);
    if (totalOtrosGastos > 0) {
      filas.push(filaDinero('Subtotal gastos', totalOtrosGastos));
    }
    filas.push(filaDinero('Subtotal vales', totalVales));
  }

  filas.push(filaDinero('Total gastos', g.total, 'negrita'));
  return filas;
}

function etiquetaDiferencia(diferencia: number): string {
  const d = Math.round(diferencia);
  if (d > 0) return 'Sobrante';
  if (d < 0) return 'Faltante';
  return 'Cuadre exacto';
}

function seccionCuadre(datos: DatosRecibo): LineaRecibo[] {
  const t = datos.turno;
  const valesCajon = datos.gastos.lista.reduce(
    (s, item) => (esValeGasto(item) ? s + item.cajon : s),
    0,
  );
  const gastosCajonSinVales = Math.max(0, datos.gastos.cajon - valesCajon);

  const filas: LineaRecibo[] = [
    titulo('CUADRE DE CAJA'),
    filaDinero('Ventas en efectivo', datos.ventas.efectivo),
    filaDinero('Gastos de caja', gastosCajonSinVales),
  ];
  if (valesCajon > 0) {
    filas.push(filaDinero('Vales de caja', valesCajon));
  }
  if (datos.retiros.total > 0) {
    filas.push(filaDinero('Retiros de caja', datos.retiros.total));
  }
  filas.push(
    salto(),
    filaDinero('Efectivo esperado', t.efectivoEsperado, 'negrita'),
    filaDinero('Dinero contado', t.efectivoContado, 'negrita'),
    salto(),
    {
      texto: fila(etiquetaDiferencia(t.diferencia), textoDiferencia(t.diferencia), anchoDe('negrita')),
      estilo: 'negrita',
      alineacion: 'izquierda',
    },
  );
  return filas;
}

/**
 * Lineas_Recibo organizadas con saltos de línea entre bloques:
 * 1. Encabezado y datos del turno
 * 2. VENTAS (Efectivo, QR/otros métodos y Total ventas)
 * 3. GASTOS DEL TURNO
 * 4. CUADRE DE CAJA (Base, Ventas efectivo, Gastos, Esperado, Contado y Sobrante/Faltante)
 * 5. RESUMEN DE PRODUCTOS (al final)
 */
export function lineasReciboCierre(
  datos: DatosRecibo,
  ahora: Date,
  limites: LimitesRecibo = SIN_LIMITE,
): LineaRecibo[] {
  const divisor = (): LineaRecibo[] => [salto(), linea(separador('-')), salto()];
  return [
    ...encabezado(),
    ...datosTurno(datos.turno, ahora),
    ...divisor(),
    ...seccionVentas(datos.ventas),
    ...divisor(),
    ...seccionGastos(datos.gastos, limites.gastos),
    ...divisor(),
    ...seccionCuadre(datos),
    ...divisor(),
    ...seccionProductos(datos.productos, limites.productos),
    salto(),
    linea(separador('=')),
  ];
}

/** lineasReciboCierre + armarBytes (con logo); si supera MAX_BYTES_RECIBO baja los límites a la mitad hasta caber. */
export function bytesReciboCierre(datos: DatosRecibo, ahora: Date): Uint8Array {
  const logo = bytesLogoEscPos();
  let limites: LimitesRecibo = {
    gastos: datos.gastos.lista.length,
    productos: datos.productos.length,
  };
  for (;;) {
    const bytes = armarBytes(lineasReciboCierre(datos, ahora, limites), logo);
    if (bytes.length <= MAX_BYTES_RECIBO) return bytes;
    if (limites.gastos === 0 && limites.productos === 0) return bytes;
    limites = { gastos: Math.floor(limites.gastos / 2), productos: Math.floor(limites.productos / 2) };
  }
}
