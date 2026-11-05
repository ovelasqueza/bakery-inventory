/** Armado del Recibo_Cierre: Datos_Recibo → Lineas_Recibo → bytes ESC/POS. Módulo puro. */
import type { DatosRecibo } from '../api/recibo';
import { diaLocal, fechaHora12, hora12 } from '../fechas/bogota';
import { ENCABEZADO_RECIBO, MAX_BYTES_RECIBO } from './config';
import { armarBytes } from './escpos';
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
  /** Aplica a PRODUCTOS y a AUTOCONSUMO. */
  productos: number;
}

export const SIN_MOVIMIENTOS = 'Sin movimientos';
export const AVISO_AUTOCONSUMO = 'Valor de referencia, no es dinero';
export const SUFIJO_CAJA_MAYOR = ' (Caja mayor)';
/** Dato ausente (turnos antiguos). Se usa '-' ASCII porque '—' no existe en PC850 y saldría '?'. */
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
    linea(ENCABEZADO_RECIBO.linea2, 'normal', 'centro'),
    linea(ENCABEZADO_RECIBO.titulo, 'negrita', 'centro'),
    linea(separador('=')),
  ];
}

function datosTurno(t: DatosRecibo['turno'], ahora: Date): LineaRecibo[] {
  const mismoDia = diaLocal(t.abiertoEn) === diaLocal(t.cerradoEn);
  const apertura = mismoDia ? hora12(t.abiertoEn) : fechaHora12(t.abiertoEn);
  const fecha = diaLocal(t.cerradoEn);
  return [
    linea(`Fecha: ${fecha}`),
    { texto: fila(`Abrió: ${limpio(t.abiertoPor)}`, apertura), estilo: 'normal', alineacion: 'izquierda' },
    { texto: fila(`Cerró: ${limpio(t.cerradoPor)}`, hora12(t.cerradoEn)), estilo: 'normal', alineacion: 'izquierda' },
    { texto: fila('Impreso:', fechaHora12(ahora)), estilo: 'normal', alineacion: 'izquierda' },
  ];
}

function seccionVentas(v: DatosRecibo['ventas']): LineaRecibo[] {
  const filas: LineaRecibo[] = [titulo('VENTAS')];
  if (v.porMetodo.length === 0) filas.push(linea(SIN_MOVIMIENTOS));
  filas.push(filaDinero(`Ventas registradas (${v.cantidad})`, v.total));
  for (const m of v.porMetodo) {
    filas.push(filaDinero(`  ${limpio(m.nombre)} (${m.cantidad})`, m.total));
  }
  filas.push(filaDinero('Ventas por valor', v.valorTotal));
  filas.push(filaDinero(`Anuladas (${v.anuladasCantidad})`, v.anuladasTotal));
  return filas;
}

function filaGasto(g: DatosRecibo['gastos']['lista'][number]): LineaRecibo {
  const valor = dineroRecibo(g.valor);
  const nombre = limpio(g.concepto) || limpio(g.categoria);
  const sufijo = g.cajon === 0 ? SUFIJO_CAJA_MAYOR : '';
  // El sufijo se conserva aunque el concepto sea largo: se recorta solo el concepto.
  const disponible = Math.max(0, anchoDe('normal') - largo(valor) - 1 - largo(sufijo));
  return { texto: fila(recortar(nombre, disponible) + sufijo, valor), estilo: 'normal', alineacion: 'izquierda' };
}

function seccionGastos(g: DatosRecibo['gastos'], limite: number): LineaRecibo[] {
  const filas: LineaRecibo[] = [titulo('GASTOS/PEDIDOS')];
  if (g.lista.length === 0) filas.push(linea(SIN_MOVIMIENTOS));
  const mostrados = g.lista.slice(0, limite);
  filas.push(...mostrados.map(filaGasto));
  if (mostrados.length < g.lista.length) filas.push(lineaRecorte(g.lista.length - mostrados.length));
  filas.push(filaDinero('Total gastos', g.total));
  filas.push(filaDinero('  Del cajón', g.cajon));
  filas.push(filaDinero('  De caja mayor', g.mayor));
  return filas;
}

function filaNulable(izquierda: string, valor: number | null): LineaRecibo {
  if (valor === null) {
    return { texto: fila(izquierda, SIN_DATO), estilo: 'normal', alineacion: 'izquierda' };
  }
  return filaDinero(izquierda, valor);
}

function seccionDinero(datos: DatosRecibo): LineaRecibo[] {
  const t = datos.turno;
  return [
    titulo('DINERO'),
    filaDinero('Base inicial', t.base),
    filaDinero('Ventas en efectivo', datos.ventas.efectivo),
    filaDinero('Gastos del cajón', datos.gastos.cajon),
    filaDinero('Retiros', datos.retiros.total),
    filaDinero('Efectivo esperado', t.efectivoEsperado),
    filaDinero('Efectivo contado', t.efectivoContado),
    { texto: fila('Diferencia', textoDiferencia(t.diferencia), anchoDe('negrita')), estilo: 'negrita', alineacion: 'izquierda' },
    filaNulable('Base dejada', t.baseSiguiente),
    filaNulable('Enviado a caja mayor', t.enviadoMayor),
  ];
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
  return [titulo('PRODUCTOS'), ...filasProductos(lista, limite), filaDinero('Total', suma(lista))];
}

/** Sección aparte de PRODUCTOS: lo que se consumió en la panadería no es venta ni dinero. */
function seccionAutoconsumo(a: DatosRecibo['autoconsumo'], limite: number): LineaRecibo[] {
  return [
    titulo('AUTOCONSUMO'),
    linea(AVISO_AUTOCONSUMO),
    ...filasProductos(a.productos, limite),
    filaDinero('Total', a.total),
  ];
}

/** Lineas_Recibo en orden: encabezado, datos del turno, VENTAS, GASTOS/PEDIDOS, DINERO, PRODUCTOS, AUTOCONSUMO (si hay). */
export function lineasReciboCierre(
  datos: DatosRecibo,
  ahora: Date,
  limites: LimitesRecibo = SIN_LIMITE,
): LineaRecibo[] {
  const sep = linea(separador('-'));
  const lineas: LineaRecibo[] = [
    ...encabezado(),
    ...datosTurno(datos.turno, ahora),
    sep,
    ...seccionVentas(datos.ventas),
    sep,
    ...seccionGastos(datos.gastos, limites.gastos),
    sep,
    ...seccionDinero(datos),
    sep,
    ...seccionProductos(datos.productos, limites.productos),
  ];
  if (datos.autoconsumo.productos.length > 0) {
    lineas.push(sep, ...seccionAutoconsumo(datos.autoconsumo, limites.productos));
  }
  return lineas;
}

/** lineasReciboCierre + armarBytes; si supera MAX_BYTES_RECIBO baja los límites a la mitad hasta caber. */
export function bytesReciboCierre(datos: DatosRecibo, ahora: Date): Uint8Array {
  let limites: LimitesRecibo = {
    gastos: datos.gastos.lista.length,
    productos: Math.max(datos.productos.length, datos.autoconsumo.productos.length),
  };
  for (;;) {
    const bytes = armarBytes(lineasReciboCierre(datos, ahora, limites));
    if (bytes.length <= MAX_BYTES_RECIBO) return bytes;
    if (limites.gastos === 0 && limites.productos === 0) return bytes;
    limites = { gastos: Math.floor(limites.gastos / 2), productos: Math.floor(limites.productos / 2) };
  }
}
