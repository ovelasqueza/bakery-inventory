import { describe, expect, it } from 'vitest';
import { COLUMNAS } from './config';
import { anchoDe, dineroRecibo, fila, recortar, separador, textoDiferencia } from './texto';

const largo = (t: string) => Array.from(t).length;

describe('dineroRecibo', () => {
  it('usa punto de miles, sin decimales ni NBSP', () => {
    expect(dineroRecibo(12345)).toBe('$ 12.345');
    expect(dineroRecibo(-5000)).toBe('-$ 5.000');
    expect(dineroRecibo(0)).toBe('$ 0');
    expect(dineroRecibo(1234567)).toBe('$ 1.234.567');
    expect(dineroRecibo(999)).toBe('$ 999');
    expect(dineroRecibo(12345)).not.toContain('\u00a0');
  });
});

describe('textoDiferencia', () => {
  it('pone signo según sobre o falte', () => {
    expect(textoDiferencia(2000)).toBe('+$ 2.000');
    expect(textoDiferencia(-2000)).toBe('-$ 2.000');
    expect(textoDiferencia(0)).toBe('$ 0');
  });
});

describe('anchoDe', () => {
  it('24 para grande y 48 para el resto', () => {
    expect(anchoDe('grande')).toBe(24);
    expect(anchoDe('normal')).toBe(48);
    expect(anchoDe('negrita')).toBe(48);
    expect(anchoDe('alto')).toBe(48);
  });
});

describe('recortar', () => {
  it('deja igual el texto corto', () => {
    expect(recortar('Pan', 10)).toBe('Pan');
  });
  it('recorta con "..." ASCII', () => {
    const r = recortar('Croissant de almendras', 10);
    expect(r).toBe('Croissa...');
    expect(largo(r)).toBeLessThanOrEqual(10);
    expect(r).not.toContain('…');
  });
  it('no parte emojis', () => {
    const r = recortar('😀😀😀😀😀😀', 5);
    expect(r).toBe('😀😀...');
  });
});

describe('fila', () => {
  it('alinea la derecha al borde con 48 columnas', () => {
    const f = fila('Pan blanco', '$ 1.000');
    expect(largo(f)).toBe(COLUMNAS);
    expect(f.startsWith('Pan blanco ')).toBe(true);
    expect(f.endsWith('$ 1.000')).toBe(true);
  });
  it('recorta la izquierda y conserva completa la derecha', () => {
    const f = fila('x'.repeat(60), '-$ 1.234.567');
    expect(largo(f)).toBe(COLUMNAS);
    expect(f.endsWith(' -$ 1.234.567')).toBe(true);
    expect(f).toContain('...');
  });
  it('respeta un ancho dado y cuenta tildes como un carácter', () => {
    const f = fila('Café con leche', '$ 3.000', 20);
    expect(largo(f)).toBe(20);
    expect(f.endsWith('$ 3.000')).toBe(true);
  });
});

describe('separador', () => {
  it('48 caracteres', () => {
    expect(separador()).toBe('-'.repeat(48));
    expect(separador('=')).toBe('='.repeat(48));
  });
});
