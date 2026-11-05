import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { armarBytes, CMD, codificarPC850, decodificarPC850 } from './escpos';
import type { Alineacion, Estilo, LineaRecibo } from './texto';

const hex = (b: Uint8Array) => Array.from(b);

describe('codificarPC850', () => {
  it('usa los códigos de la página 850 para el español', () => {
    expect(hex(codificarPC850('áéíóú'))).toEqual([0xa0, 0x82, 0xa1, 0xa2, 0xa3]);
    expect(hex(codificarPC850('ÁÉÍÓÚ'))).toEqual([0xb5, 0x90, 0xd6, 0xe0, 0xe9]);
    expect(hex(codificarPC850('ñÑüÜ¿¡°'))).toEqual([0xa4, 0xa5, 0x81, 0x9a, 0xa8, 0xad, 0xf8]);
    expect(hex(codificarPC850('Pan $ 1.000'))).toEqual(Array.from(Buffer.from('Pan $ 1.000', 'ascii')));
  });

  it('normaliza a NFC antes de codificar', () => {
    expect(hex(codificarPC850('a\u0301'))).toEqual([0xa0]);
  });

  it('fuera de la tabla usa la letra sin tilde o ?', () => {
    expect(decodificarPC850(codificarPC850('ĉāŷ'))).toBe('cay');
    expect(decodificarPC850(codificarPC850('€…😀'))).toBe('???');
    expect(hex(codificarPC850('\t\n\x7f'))).toEqual([0x3f, 0x3f, 0x3f]);
  });
});

// Feature: recibo-cierre-turno, Property 5: Codificación PC850
// **Validates: Requirements 3.2**
describe('Property 5: Codificación PC850', () => {
  const tabla = 'áéíóúÁÉÍÓÚñÑüÜ¿¡°'.split('');
  const ascii = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i));

  it('decodificar(codificar(t)) = t para caracteres de la tabla', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...tabla, ...ascii)), (cars) => {
        const t = cars.join('');
        expect(decodificarPC850(codificarPC850(t))).toBe(t);
      }),
      { numRuns: 200 },
    );
  });

  it('un byte por carácter (tras NFC) y ninguno menor que 0x20', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (t) => {
        const bytes = codificarPC850(t);
        expect(bytes.length).toBe(Array.from(t.normalize('NFC')).length);
        expect(bytes.every((b) => b >= 0x20)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: recibo-cierre-turno, Property 6: Estructura de los bytes
// **Validates: Requirements 3.1, 3.3, 3.4**
describe('Property 6: Estructura de los bytes', () => {
  const linea: fc.Arbitrary<LineaRecibo> = fc.record({
    texto: fc.fullUnicodeString({ maxLength: 60 }),
    estilo: fc.constantFrom<Estilo>('normal', 'negrita', 'alto', 'grande'),
    alineacion: fc.constantFrom<Alineacion>('izquierda', 'centro'),
  });

  it('inicio, fin y ESC ! 0 tras cada línea con estilo', () => {
    fc.assert(
      fc.property(fc.array(linea, { maxLength: 20 }), (lineas) => {
        const bytes = hex(armarBytes(lineas));
        expect(bytes.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x02]);
        expect(bytes.slice(-7)).toEqual([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]);

        // Recorrer línea por línea con la estructura esperada.
        let i = 5;
        for (const l of lineas) {
          expect(bytes.slice(i, i + 3)).toEqual(CMD.alinear(l.alineacion));
          expect(bytes.slice(i + 3, i + 6)).toEqual(CMD.estilo(l.estilo));
          i += 6;
          const texto = hex(codificarPC850(l.texto));
          expect(bytes.slice(i, i + texto.length)).toEqual(texto);
          i += texto.length;
          expect(bytes[i]).toBe(0x0a);
          i += 1;
          if (l.estilo !== 'normal') {
            expect(bytes.slice(i, i + 3)).toEqual([0x1b, 0x21, 0x00]);
            i += 3;
          }
        }
        expect(i).toBe(bytes.length - 7);
      }),
      { numRuns: 200 },
    );
  });
});

describe('armarBytes', () => {
  it('arma una línea centrada en grande', () => {
    const bytes = hex(armarBytes([{ texto: 'Año', estilo: 'grande', alineacion: 'centro' }]));
    expect(bytes).toEqual([
      0x1b, 0x40, 0x1b, 0x74, 0x02,
      0x1b, 0x61, 0x01, 0x1b, 0x21, 0x38, 0x41, 0xa4, 0x6f, 0x0a, 0x1b, 0x21, 0x00,
      0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00,
    ]);
  });
});
