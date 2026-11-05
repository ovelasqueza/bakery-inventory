/** Codificación PC850 y comandos ESC/POS del recibo. Módulo puro. */
import { PAGINA_CODIGOS } from './config';
import type { Alineacion, Estilo, LineaRecibo } from './texto';

/** Caracteres fuera de ASCII y su byte en la página de códigos 850. */
const TABLA_PC850: Readonly<Record<string, number>> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9,
  ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  '¿': 0xa8, '¡': 0xad, '°': 0xf8,
  ç: 0x87, Ç: 0x80,
  à: 0x85, è: 0x8a, ò: 0x95, ù: 0x97,
  ä: 0x84, ë: 0x89, ï: 0x8b, ö: 0x94,
  Ä: 0x8e, Ë: 0xd3, Ï: 0xd8, Ö: 0x99,
  â: 0x83, ê: 0x88, î: 0x8c, ô: 0x93, û: 0x96,
  ª: 0xa6, º: 0xa7, '«': 0xae, '»': 0xaf,
  '±': 0xf1, '·': 0xfa, '½': 0xab,
};

const INVERSA_PC850: ReadonlyMap<number, string> = new Map(
  Object.entries(TABLA_PC850).map(([c, b]) => [b, c]),
);

const INTERROGACION = 0x3f;

function esAsciiImprimible(codigo: number): boolean {
  return codigo >= 0x20 && codigo <= 0x7e;
}

/** Byte de un carácter (ya en NFC); nunca menor que 0x20. */
function byteDe(caracter: string): number {
  const codigo = caracter.codePointAt(0) ?? INTERROGACION;
  if (esAsciiImprimible(codigo)) return codigo;
  const directo = TABLA_PC850[caracter];
  if (directo !== undefined) return directo;
  // Letra sin tilde: primer carácter de la descomposición (NFD), si es representable.
  const base = Array.from(caracter.normalize('NFD'))[0];
  if (base !== undefined && base !== caracter) {
    const codigoBase = base.codePointAt(0) ?? INTERROGACION;
    if (esAsciiImprimible(codigoBase)) return codigoBase;
    const tablaBase = TABLA_PC850[base];
    if (tablaBase !== undefined) return tablaBase;
  }
  return INTERROGACION;
}

/** Byte PC850 por carácter (tras NFC); fuera de la tabla: letra sin tilde (NFD) o '?' (0x3F). */
export function codificarPC850(texto: string): Uint8Array {
  const cars = Array.from(texto.normalize('NFC'));
  const bytes = new Uint8Array(cars.length);
  cars.forEach((c, i) => {
    bytes[i] = byteDe(c);
  });
  return bytes;
}

/** Inverso para pruebas: bytes 0x20-0xFF → texto ('?' si el byte no está en la tabla). */
export function decodificarPC850(bytes: Uint8Array): string {
  let texto = '';
  for (const b of bytes) {
    if (esAsciiImprimible(b)) texto += String.fromCharCode(b);
    else texto += INVERSA_PC850.get(b) ?? '?';
  }
  return texto;
}

const VALOR_ESTILO: Readonly<Record<Estilo, number>> = {
  normal: 0x00,
  negrita: 0x08,
  alto: 0x18,
  grande: 0x38,
};

export const CMD = {
  iniciar: [0x1b, 0x40], // ESC @
  pagina: (n: number) => [0x1b, 0x74, n], // ESC t n
  alinear: (a: Alineacion) => [0x1b, 0x61, a === 'centro' ? 1 : 0], // ESC a n
  estilo: (e: Estilo) => [0x1b, 0x21, VALOR_ESTILO[e]], // ESC ! n
  avanzar: (n: number) => [0x1b, 0x64, n], // ESC d n
  cortar: [0x1d, 0x56, 0x42, 0x00], // GS V 66 0
} as const;

const LF = 0x0a;

/** ESC @, ESC t 2, por línea: [ESC a][ESC !] texto LF [ESC ! 0 si tuvo estilo]; ESC d 4; GS V 66 0. */
export function armarBytes(lineas: LineaRecibo[]): Uint8Array {
  const partes: number[] = [...CMD.iniciar, ...CMD.pagina(PAGINA_CODIGOS)];
  for (const linea of lineas) {
    partes.push(...CMD.alinear(linea.alineacion), ...CMD.estilo(linea.estilo));
    for (const b of codificarPC850(linea.texto)) partes.push(b);
    partes.push(LF);
    if (linea.estilo !== 'normal') partes.push(...CMD.estilo('normal'));
  }
  partes.push(...CMD.avanzar(4), ...CMD.cortar);
  return Uint8Array.from(partes);
}
