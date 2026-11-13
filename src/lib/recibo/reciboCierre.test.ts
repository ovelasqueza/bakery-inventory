import { describe, expect, it } from 'vitest';
import type { DatosRecibo } from '../api/recibo';
import { ENCABEZADO_RECIBO, MAX_BYTES_RECIBO } from './config';
import { decodificarPC850 } from './escpos';
import {
  SIN_MOVIMIENTOS,
  bytesReciboCierre,
  lineasReciboCierre,
} from './reciboCierre';
import { anchoDe, type LineaRecibo } from './texto';

const largo = (t: string) => Array.from(t.normalize('NFC')).length;
const textos = (l: LineaRecibo[]) => l.map((x) => x.texto);

// 2025-01-15 6:02 am → 2:10 pm en Bogotá (UTC − 5 h).
const AHORA = new Date('2025-01-15T19:11:00Z');

function ejemplo(): DatosRecibo {
  return {
    turno: {
      id: 't1', abiertoPor: 'Ana', abiertoEn: '2025-01-15T11:02:00Z',
      cerradoPor: 'Ana', cerradoEn: '2025-01-15T19:10:00Z',
      base: 100_000, efectivoEsperado: 380_000, efectivoContado: 382_000, diferencia: 2_000,
      baseSiguiente: 100_000, enviadoMayor: 282_000,
    },
    ventas: {
      total: 512_000, cantidad: 42, efectivo: 380_000, valorTotal: 45_000,
      anuladasTotal: 8_000, anuladasCantidad: 2,
      porMetodo: [
        { nombre: 'Efectivo', esEfectivo: true, total: 380_000, cantidad: 30 },
        { nombre: 'Nequi', esEfectivo: false, total: 132_000, cantidad: 12 },
      ],
    },
    gastos: {
      lista: [
        { creadoEn: '2025-01-15T13:00:00Z', categoria: 'Insumos', concepto: 'Harina', valor: 60_000, cajon: 60_000, mayor: 0 },
        { creadoEn: '2025-01-15T14:00:00Z', categoria: 'Gas', concepto: '', valor: 40_000, cajon: 0, mayor: 40_000 },
      ],
      total: 100_000, cajon: 60_000, mayor: 40_000,
    },
    retiros: { lista: [{ creadoEn: '2025-01-15T15:00:00Z', valor: 0 }], total: 0 },
    productos: [
      { nombre: 'Pan francés', cantidad: 120, valor: 240_000 },
      { nombre: 'Croissant de almendras con chocolate y arequipe', cantidad: 12, valor: 227_000 },
      { nombre: 'Venta por valor', cantidad: 3, valor: 45_000 },
    ],
    autoconsumo: {
      productos: [{ nombre: 'Pan francés', cantidad: 4, valor: 8_000 }],
      total: 8_000,
    },
  };
}

function vacio(): DatosRecibo {
  const d = ejemplo();
  return {
    ...d,
    turno: { ...d.turno, baseSiguiente: null, enviadoMayor: null, diferencia: 0 },
    ventas: { total: 0, cantidad: 0, efectivo: 0, valorTotal: 0, anuladasTotal: 0, anuladasCantidad: 0, porMetodo: [] },
    gastos: { lista: [], total: 0, cajon: 0, mayor: 0 },
    retiros: { lista: [], total: 0 },
    productos: [],
    autoconsumo: { productos: [], total: 0 },
  };
}

describe('lineasReciboCierre', () => {
  it('imprime el recibo de ejemplo (revisión a ojo)', () => {
    const lineas = lineasReciboCierre(ejemplo(), AHORA);
    const ver = lineas
      .map((l) => (l.alineacion === 'centro' ? l.texto.padStart(Math.floor((anchoDe(l.estilo) + largo(l.texto)) / 2)) : l.texto))
      .join('\n');
    console.log(`\n${ver}\n`);
    expect(lineas.length).toBeGreaterThan(20);
  });

  it('empieza con el encabezado centrado y sus estilos', () => {
    const [a, b, c] = lineasReciboCierre(ejemplo(), AHORA);
    expect(a).toEqual({ texto: ENCABEZADO_RECIBO.nombre, estilo: 'grande', alineacion: 'centro' });
    expect(b).toEqual({ texto: ENCABEZADO_RECIBO.linea2, estilo: 'normal', alineacion: 'centro' });
    expect(c).toEqual({ texto: ENCABEZADO_RECIBO.titulo, estilo: 'negrita', alineacion: 'centro' });
  });

  it('muestra fecha, horas en 12 h y las secciones elementales en orden con saltos de línea', () => {
    const t = textos(lineasReciboCierre(ejemplo(), AHORA));
    expect(t).toContain('Fecha: 2025-01-15');
    expect(t).toContain('Abrió: Ana');
    expect(t.find((x) => x.startsWith('Cerró: Ana'))?.endsWith('2:10 pm')).toBe(true);
    expect(t.find((x) => x.startsWith('Impreso:'))?.endsWith('2025-01-15 2:11 pm')).toBe(true);
    const orden = ['VENTAS', 'GASTOS DEL TURNO', 'CUADRE DE CAJA', 'RESUMEN DE PRODUCTOS'].map((s) => t.indexOf(s));
    expect(orden.every((i) => i > 0)).toBe(true);
    expect([...orden].sort((x, y) => x - y)).toEqual(orden);
    expect(t.filter((x) => x === '').length).toBeGreaterThanOrEqual(6);
  });

  it('no muestra fecha ni hora de apertura en Abrió aunque sea de otro día', () => {
    const d = ejemplo();
    d.turno.abiertoEn = '2025-01-14T22:00:00Z';
    const t = textos(lineasReciboCierre(d, AHORA));
    expect(t.find((x) => x.startsWith('Abrió:'))).toBe('Abrió: Ana');
  });

  it('marca gastos de caja mayor, usa la categoría si no hay concepto y muestra Sobrante/Faltante en negrita', () => {
    const l = lineasReciboCierre(ejemplo(), AHORA);
    const t = textos(l);
    expect(t.some((x) => x.startsWith('Harina ') && x.endsWith('$ 60.000') && !x.includes('Caja mayor'))).toBe(true);
    expect(t.some((x) => x.startsWith('Gas (Caja mayor)') && x.endsWith('$ 40.000'))).toBe(true);
    const dif = l.find((x) => x.texto.startsWith('Sobrante'));
    expect(dif?.estilo).toBe('negrita');
    expect(dif?.texto.endsWith('+$ 2.000')).toBe(true);
  });

  it('muestra Faltante cuando la diferencia es negativa', () => {
    const d = ejemplo();
    d.turno.diferencia = -3_500;
    const l = lineasReciboCierre(d, AHORA);
    const faltante = l.find((x) => x.texto.startsWith('Faltante'));
    expect(faltante?.estilo).toBe('negrita');
    expect(faltante?.texto.endsWith('-$ 3.500')).toBe(true);
  });

  it('secciones vacías dicen "Sin movimientos" y diferencia cero muestra "Cuadre exacto"', () => {
    const t = textos(lineasReciboCierre(vacio(), AHORA));
    expect(t.filter((x) => x === SIN_MOVIMIENTOS)).toHaveLength(3); // VENTAS, PRODUCTOS, GASTOS
    expect(t.find((x) => x.startsWith('Cuadre exacto'))?.endsWith('$ 0')).toBe(true);
  });

  it('cada línea cabe en su ancho aun con textos largos, emojis y saltos de línea', () => {
    const d = ejemplo();
    d.turno.abiertoPor = 'María José Rodríguez de la Santísima Trinidad 😀😀😀';
    d.gastos.lista[1].categoria = 'Categoría con nombre larguísimo que no cabe\nen una línea';
    d.productos[0].nombre = '🥐'.repeat(80);
    for (const l of lineasReciboCierre(d, AHORA)) {
      expect(largo(l.texto)).toBeLessThanOrEqual(anchoDe(l.estilo));
      expect(l.texto).not.toMatch(/[\n\r]/);
    }
    const t = textos(lineasReciboCierre(d, AHORA));
    expect(t.some((x) => x.includes('(Caja mayor)') && x.endsWith('$ 40.000'))).toBe(true);
  });

  it('recorta listas con "... y K más"', () => {
    const t = textos(lineasReciboCierre(ejemplo(), AHORA, { gastos: 1, productos: 2 }));
    expect(t).toContain('... y 1 más');
    expect(t.filter((x) => x.startsWith('... y'))).toEqual(['... y 1 más', '... y 1 más']);
  });

  it('discrimina los vales en efectivo dentro de GASTOS DEL TURNO y en CUADRE DE CAJA', () => {
    const d = ejemplo();
    d.gastos.lista.push({
      creadoEn: '2025-01-15T16:00:00Z',
      categoria: 'Vales de caja',
      concepto: 'Vale (Juan): Adelanto',
      valor: 25_000,
      cajon: 25_000,
      mayor: 0,
    });
    d.gastos.total += 25_000;
    d.gastos.cajon += 25_000;
    const t = textos(lineasReciboCierre(d, AHORA));
    expect(t.some((x) => x.startsWith('Vale (Juan): Adelanto') && x.endsWith('$ 25.000'))).toBe(true);
    expect(t.some((x) => x.startsWith('Subtotal gastos') && x.endsWith('$ 100.000'))).toBe(true);
    expect(t.some((x) => x.startsWith('Subtotal vales') && x.endsWith('$ 25.000'))).toBe(true);
    expect(t.some((x) => x.startsWith('Total gastos') && x.endsWith('$ 125.000'))).toBe(true);
    expect(t.some((x) => x.startsWith('Gastos de caja') && x.endsWith('$ 60.000'))).toBe(true);
    expect(t.some((x) => x.startsWith('Vales de caja') && x.endsWith('$ 25.000'))).toBe(true);
  });
});

describe('bytesReciboCierre', () => {
  it('el ejemplo cabe sin recorte', () => {
    const b = bytesReciboCierre(ejemplo(), AHORA);
    expect(b.length).toBeLessThanOrEqual(MAX_BYTES_RECIBO);
    expect(decodificarPC850(b)).not.toContain('... y');
  });

  it('con 5.000 gastos y productos recorta hasta caber', () => {
    const d = ejemplo();
    d.gastos.lista = Array.from({ length: 5000 }, (_, i) => ({
      creadoEn: '2025-01-15T13:00:00Z', categoria: 'Insumos', concepto: `Gasto número ${i} con nombre largo`,
      valor: 1000, cajon: 1000, mayor: 0,
    }));
    d.productos = Array.from({ length: 5000 }, (_, i) => ({ nombre: `Producto ${i} con nombre largo`, cantidad: 1, valor: 1000 }));
    const b = bytesReciboCierre(d, AHORA);
    expect(b.length).toBeLessThanOrEqual(MAX_BYTES_RECIBO);
    const texto = decodificarPC850(b);
    expect(texto).toMatch(/\.\.\. y \d+ más/);
  });
});
