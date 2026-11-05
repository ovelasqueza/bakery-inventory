import { describe, expect, it } from 'vitest';
import {
  CALCULADORA_INICIAL,
  VALOR_MAX,
  reducirCalculadora,
  teclear,
  totalValores,
  valoresParaCobrar,
  type EstadoCalculadora,
} from './calculadora';

describe('teclear', () => {
  it('agrega dígitos y 000 al final', () => {
    expect(teclear(0, '5').digitado).toBe(5);
    expect(teclear(5, '000').digitado).toBe(5000);
    expect(teclear(12, '3').digitado).toBe(123);
  });

  it('conserva el valor si se pasaría del máximo', () => {
    expect(teclear(VALOR_MAX, '0')).toEqual({ digitado: VALOR_MAX, aviso: 'VALOR_MAXIMO' });
    expect(teclear(10_001, '000')).toEqual({ digitado: 10_001, aviso: 'VALOR_MAXIMO' });
    expect(teclear(10_000, '000').digitado).toBe(VALOR_MAX);
  });

  it('retroceso quita el último dígito y borrar deja 0', () => {
    expect(teclear(1234, 'retroceso').digitado).toBe(123);
    expect(teclear(7, 'retroceso').digitado).toBe(0);
    expect(teclear(1234, 'borrar').digitado).toBe(0);
  });
});

describe('reducirCalculadora', () => {
  it('agrega, quita y vacía', () => {
    let e: EstadoCalculadora = { ...CALCULADORA_INICIAL, digitado: 3000 };
    e = reducirCalculadora(e, { tipo: 'agregar' }).estado;
    e = reducirCalculadora({ ...e, digitado: 2000 }, { tipo: 'agregar' }).estado;
    expect(e.valores.map((v) => v.valor)).toEqual([3000, 2000]);
    expect(e.digitado).toBe(0);
    expect(totalValores(e.valores)).toBe(5000);

    e = reducirCalculadora(e, { tipo: 'quitar', id: e.valores[0].id }).estado;
    expect(e.valores.map((v) => v.valor)).toEqual([2000]);

    e = reducirCalculadora({ ...e, digitado: 9 }, { tipo: 'vaciar' }).estado;
    expect(e.valores).toEqual([]);
    expect(e.digitado).toBe(0);
  });

  it('agregar con 0 no cambia la lista', () => {
    const r = reducirCalculadora(CALCULADORA_INICIAL, { tipo: 'agregar' });
    expect(r.estado).toBe(CALCULADORA_INICIAL);
    expect(r.aviso).toBeUndefined();
  });

  it('avisa al pasar los límites de cantidad y total', () => {
    const lleno: EstadoCalculadora = {
      digitado: 1,
      valores: Array.from({ length: 200 }, (_, i) => ({ id: i + 1, valor: 1 })),
      siguienteId: 201,
    };
    expect(reducirCalculadora(lleno, { tipo: 'agregar' })).toEqual({ estado: lleno, aviso: 'VALORES_MAXIMOS' });

    const alto: EstadoCalculadora = {
      digitado: 2,
      valores: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, valor: i < 9 ? VALOR_MAX : 9_999_998 })),
      siguienteId: 11,
    };
    expect(reducirCalculadora(alto, { tipo: 'agregar' })).toEqual({ estado: alto, aviso: 'TOTAL_MAXIMO' });
  });
});

describe('valoresParaCobrar', () => {
  it('agrega el digitado pendiente', () => {
    const e: EstadoCalculadora = { digitado: 500, valores: [{ id: 1, valor: 1000 }], siguienteId: 2 };
    const r = valoresParaCobrar(e);
    expect(r.ok && r.valores).toEqual([1000, 500]);
    expect(r.ok && r.estado.digitado).toBe(0);
  });

  it('devuelve la lista tal cual sin digitado y falla vacío', () => {
    const e: EstadoCalculadora = { digitado: 0, valores: [{ id: 1, valor: 1000 }], siguienteId: 2 };
    expect(valoresParaCobrar(e)).toEqual({ ok: true, estado: e, valores: [1000] });
    expect(valoresParaCobrar(CALCULADORA_INICIAL)).toEqual({ ok: false, aviso: 'VACIO' });
  });
});
