import { describe, expect, it } from 'vitest';
import { ENCABEZADO_RECIBO, MAX_BYTES_RECIBO } from './config';
import {
  bytesReciboMariela,
  esHoraResumenMariela,
  lineasReciboMariela,
  SIN_GASTOS_DIA,
  type DatosResumenMariela,
} from './reciboDiaMariela';
import { anchoDe, type LineaRecibo } from './texto';

const largo = (t: string) => Array.from(t.normalize('NFC')).length;
const textos = (l: LineaRecibo[]) => l.map((x) => x.texto);

const AHORA = new Date('2025-01-16T01:15:00Z'); // 2025-01-15 8:15 pm Bogotá

function ejemploDia(): DatosResumenMariela {
  return {
    fecha: '2026-11-15',
    ventasEfectivo: 620_000,
    ventasQr: 185_000,
    totalVentas: 805_000,
    gastos: [
      { concepto: 'Harina', valor: 60_000 },
      { concepto: 'Gas', valor: 40_000 },
      { concepto: 'Vale (Juan): Adelanto', valor: 25_000 },
    ],
    totalGastos: 125_000,
  };
}

describe('esHoraResumenMariela', () => {
  it('es true entre las 7:00 pm y las 10:59 pm en hora de Bogotá', () => {
    expect(esHoraResumenMariela('2025-01-16T00:00:00Z')).toBe(true); // 7:00 pm Bogotá
    expect(esHoraResumenMariela('2025-01-16T01:30:00Z')).toBe(true); // 8:30 pm Bogotá
    expect(esHoraResumenMariela('2025-01-16T03:00:00Z')).toBe(true); // 10:00 pm Bogotá
    expect(esHoraResumenMariela('2025-01-16T03:59:00Z')).toBe(true); // 10:59 pm Bogotá
  });

  it('es false fuera del rango de 7 pm a 10 pm', () => {
    expect(esHoraResumenMariela('2025-01-15T19:10:00Z')).toBe(false); // 2:10 pm Bogotá
    expect(esHoraResumenMariela('2025-01-15T23:59:00Z')).toBe(false); // 6:59 pm Bogotá
    expect(esHoraResumenMariela('2025-01-16T04:05:00Z')).toBe(false); // 11:05 pm Bogotá
  });
});

describe('lineasReciboMariela', () => {
  it('imprime el tiquete de Doña Mariela con cuadros y separación clara', () => {
    const lineas = lineasReciboMariela(ejemploDia(), AHORA);
    const ver = lineas
      .map((l) =>
        l.alineacion === 'centro'
          ? l.texto.padStart(Math.floor((anchoDe(l.estilo) + largo(l.texto)) / 2))
          : l.texto,
      )
      .join('\n');
    console.log(`\n${ver}\n`);

    const t = textos(lineas);
    expect(t).toContain(ENCABEZADO_RECIBO.nombre);
    expect(t).toContain(ENCABEZADO_RECIBO.nit);
    expect(t).toContain(ENCABEZADO_RECIBO.linea2);
    expect(t).toContain('PARA DOÑA MARIELA');
    expect(t).toContain('VENTAS DEL DIA DOMINGO');
    expect(t).toContain('(15/11/2026)');
    expect(t.some((x) => x.includes('Impreso:'))).toBe(false);
    expect(t.some((x) => x.includes('Fecha del día:'))).toBe(false);
    expect(t.some((x) => x.startsWith('Ventas en Efectivo') && x.endsWith('$ 620.000'))).toBe(true);
    expect(t.some((x) => x.startsWith('Ventas en QR') && x.endsWith('$ 185.000'))).toBe(true);
    expect(t.some((x) => x.includes('TOTAL VENTAS DEL DIA') && x.includes('$ 805.000'))).toBe(true);
    expect(t.some((x) => x.includes('TOTAL GASTOS DEL DIA') && x.includes('$ 125.000'))).toBe(true);

    // Verificar que Ventas en Efectivo y Ventas en QR vayan en negrita
    const lineaQr = lineas.find((l) => l.texto.startsWith('Ventas en QR'));
    const lineaEf = lineas.find((l) => l.texto.startsWith('Ventas en Efectivo'));
    expect(lineaQr?.estilo).toBe('negrita');
    expect(lineaEf?.estilo).toBe('negrita');

    // Ninguna línea supera el ancho de su estilo
    for (const l of lineas) {
      expect(largo(l.texto)).toBeLessThanOrEqual(anchoDe(l.estilo));
    }
  });

  it('muestra mensaje cuando no hubo gastos en el día', () => {
    const sinGastos: DatosResumenMariela = {
      ...ejemploDia(),
      gastos: [],
      totalGastos: 0,
    };
    const t = textos(lineasReciboMariela(sinGastos, AHORA));
    expect(t).toContain(SIN_GASTOS_DIA);
  });

  it('bytesReciboMariela respeta MAX_BYTES_RECIBO', () => {
    const bytes = bytesReciboMariela(ejemploDia(), AHORA);
    expect(bytes.length).toBeLessThanOrEqual(MAX_BYTES_RECIBO);
  });
});
