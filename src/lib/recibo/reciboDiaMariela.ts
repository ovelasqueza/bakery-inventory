/**
 * Armado e impresión del tiquete resumido del día "PARA DOÑA MARIELA" (80 mm ESC/POS).
 * Se imprime automáticamente al cerrar turno entre las 7:00 pm y las 10:59 pm (hora Bogotá).
 */
import { obtenerReporte } from '../api/reportes';
import { imprimirEnAgente } from '../cajon';
import { diaLocal, horaLocal } from '../fechas/bogota';
import { COLUMNAS, ENCABEZADO_RECIBO, MAX_BYTES_RECIBO } from './config';
import { armarBytes } from './escpos';
import type { ResultadoRecibo } from './imprimir';
import { bytesLogoEscPos } from './logo';
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

export interface GastoDiaMariela {
  concepto: string;
  valor: number;
}

export interface DatosResumenMariela {
  fecha: string; // 'AAAA-MM-DD'
  ventasEfectivo: number;
  ventasQr: number;
  totalVentas: number;
  gastos: GastoDiaMariela[];
  totalGastos: number;
}

export const SIN_GASTOS_DIA = 'Sin gastos registrados hoy';

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

/**
 * Dibuja un recuadro ASCII de 48 columnas para resaltar un total importante:
 * +----------------------------------------------+
 * | ETIQUETA                           $ 000.000 |
 * +----------------------------------------------+
 */
function cuadroTotal(etiqueta: string, valor: number): LineaRecibo[] {
  const borde = `+${'-'.repeat(COLUMNAS - 2)}+`;
  const interiorAncho = COLUMNAS - 4; // "| " + contenido + " |"
  const contenido = fila(etiqueta, dineroRecibo(valor), interiorAncho);
  return [
    linea(borde, 'negrita'),
    linea(`| ${contenido} |`, 'negrita'),
    linea(borde, 'negrita'),
  ];
}

const DIAS_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'] as const;

function formatearEncabezadoDia(fechaIso: string): { diaSemana: string; fechaCorta: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso.trim());
  if (!m) return { diaSemana: '', fechaCorta: `(${fechaIso})` };
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const idx = new Date(Date.UTC(yyyy, mm - 1, dd)).getUTCDay();
  return {
    diaSemana: DIAS_SEMANA[idx] ?? '',
    fechaCorta: `(${m[3]}/${m[2]}/${m[1]})`,
  };
}

/**
 * Indica si una fecha/hora cae en la franja nocturna de cierre final (7:00 pm a 10:59 pm Bogotá).
 */
export function esHoraResumenMariela(isoUtcODate: string | Date): boolean {
  const hhmm = horaLocal(isoUtcODate);
  const hora = Number(hhmm.slice(0, 2));
  return hora >= 19 && hora <= 22;
}

/**
 * Arma las líneas del tiquete resumido del día para Doña Mariela.
 */
export function lineasReciboMariela(
  datos: DatosResumenMariela,
  _ahora: Date = new Date(),
  limiteGastos = Infinity,
): LineaRecibo[] {
  const { diaSemana, fechaCorta } = formatearEncabezadoDia(datos.fecha);
  const tituloVentas = diaSemana ? `VENTAS DEL DIA ${diaSemana}` : 'VENTAS DEL DIA';

  const lineas: LineaRecibo[] = [
    // Misma cabecera con logo, nombre, NIT y dirección
    linea(ENCABEZADO_RECIBO.nombre, 'grande', 'centro'),
    linea(ENCABEZADO_RECIBO.nit, 'normal', 'centro'),
    linea(ENCABEZADO_RECIBO.linea2, 'normal', 'centro'),
    linea(separador('=')),
    salto(),
    linea('PARA DOÑA MARIELA', 'grande', 'centro'),
    salto(),

    // SECCIÓN 1: VENTAS DEL DÍA + DÍA DE LA SEMANA Y FECHA ENTRE PARÉNTESIS
    linea(tituloVentas, 'alto', 'centro'),
    linea(fechaCorta, 'negrita', 'centro'),
    linea(separador('-')),
    filaDinero('Ventas en Efectivo', datos.ventasEfectivo, 'negrita'),
    filaDinero('Ventas en QR', datos.ventasQr, 'negrita'),
    salto(),
    ...cuadroTotal('TOTAL VENTAS DEL DIA', datos.totalVentas),

    // Separación amplia y clara entre Ventas y Gastos
    salto(),
    salto(),
    linea(separador('=')),
    salto(),

    // SECCIÓN 2: GASTOS DEL DÍA (todos los turnos)
    linea('GASTOS DEL DIA', 'alto', 'centro'),
    linea(separador('-')),
  ];

  if (datos.gastos.length === 0) {
    lineas.push(linea(SIN_GASTOS_DIA));
  } else {
    const mostrados = datos.gastos.slice(0, limiteGastos);
    for (const g of mostrados) {
      lineas.push(filaDinero(limpio(g.concepto) || 'Gasto', g.valor));
    }
    if (mostrados.length < datos.gastos.length) {
      lineas.push(linea(`... y ${datos.gastos.length - mostrados.length} más`));
    }
  }

  lineas.push(
    salto(),
    ...cuadroTotal('TOTAL GASTOS DEL DIA', datos.totalGastos),
    salto(),
    linea(separador('=')),
  );

  return lineas;
}

/** Convierte DatosResumenMariela en bytes ESC/POS con el logo en el encabezado. */
export function bytesReciboMariela(datos: DatosResumenMariela, ahora: Date = new Date()): Uint8Array {
  const logo = bytesLogoEscPos();
  let limite = datos.gastos.length;
  for (;;) {
    const bytes = armarBytes(lineasReciboMariela(datos, ahora, limite), logo);
    if (bytes.length <= MAX_BYTES_RECIBO || limite === 0) return bytes;
    limite = Math.floor(limite / 2);
  }
}

/** Consulta todas las ventas y todos los gastos del día (sin importar cuántos turnos hubo). */
export async function obtenerDatosResumenMariela(fechaDia: string): Promise<DatosResumenMariela> {
  const reporte = await obtenerReporte({ desde: fechaDia, hasta: fechaDia });
  const metodoPorId = new Map(reporte.metodos.map((m) => [m.id, m]));
  const categoriaPorId = new Map(reporte.categoriasGasto.map((c) => [c.id, c.nombre]));

  let ventasEfectivo = 0;
  let ventasQr = 0;

  for (const v of reporte.ventas) {
    if (v.estado !== 'registrada') continue;
    const metodo = metodoPorId.get(v.metodoPagoId);
    if (metodo?.esEfectivo) {
      ventasEfectivo += v.total;
    } else {
      ventasQr += v.total;
    }
  }

  const totalVentas = ventasEfectivo + ventasQr;

  const gastos: GastoDiaMariela[] = reporte.gastos.map((g) => {
    const cat = categoriaPorId.get(g.categoriaGastoId) ?? '';
    const textoConcepto = limpio(g.concepto) || limpio(cat) || 'Gasto';
    return {
      concepto: textoConcepto,
      valor: g.valor,
    };
  });

  const totalGastos = gastos.reduce((s, g) => s + g.valor, 0);

  return {
    fecha: fechaDia,
    ventasEfectivo,
    ventasQr,
    totalVentas,
    gastos,
    totalGastos,
  };
}

/** Obtiene los datos del día y envía el tiquete de Doña Mariela al agente de impresión. */
export async function imprimirReciboMariela(
  fechaDia: string = diaLocal(new Date()),
  ahora: Date = new Date(),
): Promise<ResultadoRecibo> {
  let bytes: Uint8Array;
  try {
    const datos = await obtenerDatosResumenMariela(fechaDia);
    bytes = bytesReciboMariela(datos, ahora);
  } catch {
    return { ok: false, motivo: 'sin_datos' };
  }
  return imprimirEnAgente(bytes);
}
