import { afterEach, describe, expect, it, vi } from 'vitest';
import { aBase64, imprimirEnAgente } from './cajon';

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('aBase64', () => {
  it('codifica un arreglo vacío y uno pequeño', () => {
    expect(aBase64(new Uint8Array())).toBe('');
    expect(aBase64(new Uint8Array([0x1b, 0x40, 0xff, 0x00]))).toBe(Buffer.from([0x1b, 0x40, 0xff, 0x00]).toString('base64'));
  });

  it('codifica igual que Buffer cuando pasa de un bloque de 8 KB', () => {
    const bytes = new Uint8Array(20_000).map((_, i) => (i * 37) % 256);
    expect(aBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('imprimirEnAgente', () => {
  it('manda POST /imprimir con el base64 como string sin encabezados propios', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const bytes = new Uint8Array([1, 2, 3]);

    await expect(imprimirEnAgente(bytes)).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:17777/imprimir');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(Buffer.from(bytes).toString('base64'));
    expect(init.headers).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('devuelve sin_agente si fetch falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(imprimirEnAgente(new Uint8Array([1]))).resolves.toEqual({ ok: false, motivo: 'sin_agente' });
  });

  it('devuelve error con el mensaje del agente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ok: false, error: 'Recibo inválido' }, 400)));
    await expect(imprimirEnAgente(new Uint8Array([1]))).resolves.toEqual({
      ok: false,
      motivo: 'error',
      mensaje: 'Recibo inválido',
    });
  });

  it('devuelve error con el estado HTTP si la respuesta no es JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    await expect(imprimirEnAgente(new Uint8Array([1]))).resolves.toEqual({
      ok: false,
      motivo: 'error',
      mensaje: 'error HTTP 502',
    });
  });
});
