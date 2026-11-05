import { describe, expect, it } from 'vitest';
import { calcularCierre, efectivoEsperado, parteCajon, requiereAdvertencia } from './turno';

describe('parteCajon', () => {
  it('gasto antiguo sin orígenes sale completo del cajón', () => {
    expect(parteCajon({ valor: 5000, eliminado: false })).toBe(5000);
    expect(parteCajon({ valor: 5000, eliminado: false, origenes: [] })).toBe(5000);
  });

  it('solo cuenta la fuente Cajón en un gasto combinado', () => {
    const g = {
      valor: 50000,
      eliminado: false,
      origenes: [
        { parteId: null, valor: 20000 },
        { parteId: 'nequi', valor: 30000 },
      ],
    };
    expect(parteCajon(g)).toBe(20000);
  });
});

describe('efectivoEsperado', () => {
  it('base + ventas en efectivo − parte cajón − retiros', () => {
    const r = efectivoEsperado({
      base: 100000,
      ventas: [
        { total: 30000, esEfectivo: true, estado: 'registrada', metodoPagoId: 'ef' },
        { total: 9000, esEfectivo: true, estado: 'anulada', metodoPagoId: 'ef' },
        { total: 15000, esEfectivo: false, estado: 'registrada', metodoPagoId: 'nequi' },
      ],
      gastos: [
        { valor: 5000, eliminado: false },
        { valor: 7000, eliminado: true },
        { valor: 40000, eliminado: false, origenes: [{ parteId: 'nequi', valor: 40000 }] },
      ],
      retiros: [20000],
    });
    expect(r).toBe(100000 + 30000 - 5000 - 20000);
  });

  it('sin retiros funciona igual que antes', () => {
    expect(efectivoEsperado({ base: 1000, ventas: [], gastos: [] })).toBe(1000);
  });
});

describe('requiereAdvertencia', () => {
  it('avisa solo cuando el valor supera el esperado', () => {
    expect(requiereAdvertencia(1001, 1000)).toBe(true);
    expect(requiereAdvertencia(1000, 1000)).toBe(false);
  });
});

describe('calcularCierre', () => {
  it('envía contado − base', () => {
    expect(calcularCierre(150000, 100000)).toEqual({ ok: true, enviado: 50000 });
    expect(calcularCierre(0, 0)).toEqual({ ok: true, enviado: 0 });
  });

  it('rechaza base mayor que el contado o negativa', () => {
    expect(calcularCierre(50000, 60000)).toEqual({ ok: false, error: 'BASE_MAYOR_CONTADO' });
    expect(calcularCierre(50000, -1)).toEqual({ ok: false, error: 'BASE_MAYOR_CONTADO' });
  });
});
