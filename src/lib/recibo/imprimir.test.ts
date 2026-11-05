import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { datosReciboCierre, type DatosRecibo } from '../api/recibo';
import { imprimirReciboCierre, mensajeImpresion } from './imprimir';
import { bytesReciboCierre } from './reciboCierre';

vi.mock('../api/recibo', () => ({ datosReciboCierre: vi.fn() }));

const AHORA = new Date('2025-01-15T19:11:00Z');

const DATOS: DatosRecibo = {
  turno: {
    id: 't1', abiertoPor: 'Ana', abiertoEn: '2025-01-15T11:02:00Z', cerradoPor: 'Ana', cerradoEn: '2025-01-15T19:10:00Z',
    base: 100_000, efectivoEsperado: 150_000, efectivoContado: 150_000, diferencia: 0,
    baseSiguiente: 100_000, enviadoMayor: 50_000,
  },
  ventas: {
    total: 50_000, cantidad: 3, efectivo: 50_000, valorTotal: 50_000, anuladasTotal: 0, anuladasCantidad: 0,
    porMetodo: [{ nombre: 'Efectivo', esEfectivo: true, total: 50_000, cantidad: 3 }],
  },
  gastos: { lista: [], total: 0, cajon: 0, mayor: 0 },
  retiros: { lista: [], total: 0 },
  productos: [{ nombre: 'Pan', cantidad: 10, valor: 50_000 }],
  autoconsumo: { productos: [], total: 0 },
};

const datosMock = vi.mocked(datosReciboCierre);

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status });
}

beforeEach(() => {
  datosMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('imprimirReciboCierre', () => {
  it('pide los datos del turno y manda sus bytes al agente', async () => {
    datosMock.mockResolvedValue(DATOS);
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await imprimirReciboCierre('t1', AHORA);

    expect(r).toEqual({ ok: true });
    expect(datosMock).toHaveBeenCalledWith('t1');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(Buffer.from(bytesReciboCierre(DATOS, AHORA)).toString('base64'));
    expect(mensajeImpresion(r)).toBe('Recibo impreso');
  });

  it('devuelve sin_datos sin llamar al agente si no se leen los datos', async () => {
    datosMock.mockRejectedValue(new Error('SIN_CONEXION'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const r = await imprimirReciboCierre('t1', AHORA);

    expect(r).toEqual({ ok: false, motivo: 'sin_datos' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mensajeImpresion(r)).toBe('No se pudieron leer los datos del recibo. El turno sí quedó cerrado.');
  });

  it('devuelve sin_agente si el agente no responde', async () => {
    datosMock.mockResolvedValue(DATOS);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const r = await imprimirReciboCierre('t1', AHORA);

    expect(r).toEqual({ ok: false, motivo: 'sin_agente' });
    expect(mensajeImpresion(r)).toBe(
      'No se pudo imprimir: el agente de la impresora no responde. El turno sí quedó cerrado.',
    );
  });

  it('devuelve error con el texto del agente', async () => {
    datosMock.mockResolvedValue(DATOS);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ok: false, error: 'Recibo muy grande' }, 413)));

    const r = await imprimirReciboCierre('t1', AHORA);

    expect(r).toEqual({ ok: false, motivo: 'error', mensaje: 'Recibo muy grande' });
    expect(mensajeImpresion(r)).toBe('No se pudo imprimir: Recibo muy grande. El turno sí quedó cerrado.');
  });
});
