import { describe, expect, it } from 'vitest';
import {
  datosCobroDirecto,
  firmaCobroDirecto,
  metodoPorDefecto,
  metodoVigente,
  RECIBIDO_MAX,
  type MetodoCobro,
} from './cobro';

const metodos: MetodoCobro[] = [
  { id: 'nequi', esEfectivo: false, activo: true },
  { id: 'efectivo-viejo', esEfectivo: true, activo: false },
  { id: 'efectivo', esEfectivo: true, activo: true },
];

describe('metodoPorDefecto', () => {
  it('prefiere el primer efectivo activo', () => {
    expect(metodoPorDefecto(metodos)).toBe('efectivo');
  });
  it('sin efectivo activo usa el primer activo', () => {
    expect(metodoPorDefecto(metodos.slice(0, 2))).toBe('nequi');
  });
  it('sin activos devuelve null', () => {
    expect(metodoPorDefecto([metodos[1]])).toBeNull();
    expect(metodoPorDefecto([])).toBeNull();
  });
});

describe('metodoVigente', () => {
  it('conserva un id activo', () => {
    expect(metodoVigente(metodos, 'nequi')).toBe('nequi');
  });
  it('vuelve al de por defecto si el id está inactivo, no existe o es null', () => {
    expect(metodoVigente(metodos, 'efectivo-viejo')).toBe('efectivo');
    expect(metodoVigente(metodos, 'otro')).toBe('efectivo');
    expect(metodoVigente(metodos, null)).toBe('efectivo');
  });
});

describe('datosCobroDirecto', () => {
  it('lista vacía: VACIO', () => {
    expect(datosCobroDirecto([], true)).toEqual({ ok: false, motivo: 'VACIO' });
    expect(datosCobroDirecto([], false)).toEqual({ ok: false, motivo: 'VACIO' });
  });
  it('efectivo: recibido = total y cambio 0', () => {
    expect(datosCobroDirecto([2000, 3500], true)).toEqual({
      ok: true,
      recibido: 5500,
      total: 5500,
      cambio: 0,
    });
  });
  it('efectivo en el límite se acepta y por encima da EFECTIVO_MAXIMO', () => {
    expect(datosCobroDirecto([RECIBIDO_MAX], true)).toEqual({
      ok: true,
      recibido: RECIBIDO_MAX,
      total: RECIBIDO_MAX,
      cambio: 0,
    });
    expect(datosCobroDirecto([RECIBIDO_MAX, 1], true)).toEqual({
      ok: false,
      motivo: 'EFECTIVO_MAXIMO',
    });
  });
  it('otro método: recibido null, sin límite de efectivo', () => {
    expect(datosCobroDirecto([RECIBIDO_MAX, 1], false)).toEqual({
      ok: true,
      recibido: null,
      total: RECIBIDO_MAX + 1,
      cambio: 0,
    });
  });
});

describe('firmaCobroDirecto', () => {
  it('cambia con los valores, su orden o el método', () => {
    const base = firmaCobroDirecto([1000, 2000], 'efectivo');
    expect(firmaCobroDirecto([1000, 2000], 'efectivo')).toBe(base);
    expect(firmaCobroDirecto([2000, 1000], 'efectivo')).not.toBe(base);
    expect(firmaCobroDirecto([1000, 2000], 'nequi')).not.toBe(base);
    expect(firmaCobroDirecto([1000], 'efectivo')).not.toBe(base);
  });
});
