import { describe, expect, it } from 'vitest';
import {
  aplicarMovimientos,
  baseProximoTurno,
  entradasCierre,
  movimientosEliminacion,
  movimientosGasto,
  textoOrigen,
  validarOrigenes,
} from './cajaMayor';

const partes = new Set(['ef', 'nequi']);

describe('validarOrigenes', () => {
  it('acepta un gasto combinado que suma el total', () => {
    expect(
      validarOrigenes(50000, [{ parteId: null, valor: 20000 }, { parteId: 'nequi', valor: 30000 }], {
        conTurno: true,
        partes,
      })
    ).toEqual({ ok: true });
  });

  it('rechaza cada caso inválido con su código', () => {
    const op = { conTurno: true, partes };
    expect(validarOrigenes(100, [], op)).toEqual({ ok: false, error: 'VACIO' });
    expect(validarOrigenes(100, [{ parteId: null, valor: 0 }], op)).toEqual({ ok: false, error: 'VALOR_INVALIDO' });
    expect(validarOrigenes(100, [{ parteId: null, valor: 1.5 }], op)).toEqual({ ok: false, error: 'VALOR_INVALIDO' });
    expect(
      validarOrigenes(100, [{ parteId: 'ef', valor: 50 }, { parteId: 'ef', valor: 50 }], op)
    ).toEqual({ ok: false, error: 'FUENTE_REPETIDA' });
    expect(validarOrigenes(100, [{ parteId: 'x', valor: 100 }], op)).toEqual({ ok: false, error: 'PARTE_INEXISTENTE' });
    expect(validarOrigenes(100, [{ parteId: 'ef', valor: 90 }], op)).toEqual({ ok: false, error: 'SUMA_DISTINTA' });
    expect(
      validarOrigenes(100, [{ parteId: null, valor: 100 }], { conTurno: false, partes })
    ).toEqual({ ok: false, error: 'CAJON_SIN_TURNO' });
  });
});

describe('baseProximoTurno', () => {
  it('usa la base del último cierre o la de configuración', () => {
    expect(baseProximoTurno(30000, 100000)).toBe(30000);
    expect(baseProximoTurno(0, 100000)).toBe(0);
    expect(baseProximoTurno(null, 100000)).toBe(100000);
    expect(baseProximoTurno(undefined, 100000)).toBe(100000);
  });
});

describe('entradasCierre', () => {
  it('agrupa no efectivo por método y omite anuladas, efectivo y ceros', () => {
    const r = entradasCierre(50000, [
      { total: 10000, esEfectivo: false, estado: 'registrada', metodoPagoId: 'nequi' },
      { total: 5000, esEfectivo: false, estado: 'registrada', metodoPagoId: 'nequi' },
      { total: 7000, esEfectivo: false, estado: 'anulada', metodoPagoId: 'daviplata' },
      { total: 9000, esEfectivo: true, estado: 'registrada', metodoPagoId: 'ef' },
    ]);
    expect(r).toEqual([
      { metodoPagoId: null, valor: 50000 },
      { metodoPagoId: 'nequi', valor: 15000 },
    ]);
    expect(entradasCierre(0, [])).toEqual([]);
  });
});

describe('aplicarMovimientos', () => {
  it('encadena saldos y no modifica el mapa original', () => {
    const inicial = new Map([['ef', 1000]]);
    const r = aplicarMovimientos(inicial, [
      { parteId: 'ef', valor: -400 },
      { parteId: 'nequi', valor: 200 },
      { parteId: 'ef', valor: 100 },
    ]);
    expect(r).toEqual({ ok: true, saldos: new Map([['ef', 700], ['nequi', 200]]), saldosDespues: [600, 200, 700] });
    expect(inicial.get('ef')).toBe(1000);
  });

  it('rechaza el lote si una Parte queda negativa', () => {
    expect(aplicarMovimientos(new Map([['ef', 100]]), [{ parteId: 'ef', valor: -101 }])).toEqual({
      ok: false,
      parteId: 'ef',
    });
  });
});

describe('movimientosGasto / movimientosEliminacion', () => {
  it('ignora el Cajón y la eliminación devuelve los saldos', () => {
    const origenes = [{ parteId: null, valor: 20000 }, { parteId: 'nequi', valor: 30000 }];
    expect(movimientosGasto(origenes)).toEqual([{ parteId: 'nequi', valor: -30000 }]);
    expect(movimientosEliminacion(origenes)).toEqual([{ parteId: 'nequi', valor: 30000 }]);

    const inicial = new Map([['nequi', 30000]]);
    const tras = aplicarMovimientos(inicial, [...movimientosGasto(origenes), ...movimientosEliminacion(origenes)]);
    expect(tras.ok && tras.saldos).toEqual(inicial);
  });
});

describe('textoOrigen', () => {
  const nombres = new Map([['nequi', 'Nequi']]);
  const f = (n: number) => `$ ${n.toLocaleString('es-CO')}`;

  it('Cajón, una Parte o combinado', () => {
    expect(textoOrigen([], nombres, f)).toBe('Cajón');
    expect(textoOrigen([{ parteId: null, valor: 5 }], nombres, f)).toBe('Cajón');
    expect(textoOrigen([{ parteId: 'nequi', valor: 5 }], nombres, f)).toBe('Nequi');
    expect(
      textoOrigen([{ parteId: null, valor: 20000 }, { parteId: 'nequi', valor: 30000 }], nombres, f)
    ).toBe(`Cajón ${f(20000)} + Nequi ${f(30000)}`);
  });
});
