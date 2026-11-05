/** Formato de líneas del recibo. Módulo puro. */
import { COLUMNAS, COLUMNAS_DOBLE } from './config';

/** grande = doble ancho y alto + negrita. */
export type Estilo = 'normal' | 'negrita' | 'alto' | 'grande';
export type Alineacion = 'izquierda' | 'centro';
export interface LineaRecibo {
  texto: string;
  estilo: Estilo;
  alineacion: Alineacion;
}

const PUNTOS = '...';

/** Caracteres (puntos de código) del texto normalizado a NFC. */
function caracteres(texto: string): string[] {
  return Array.from(texto.normalize('NFC'));
}

export function anchoDe(estilo: Estilo): number {
  return estilo === 'grande' ? COLUMNAS_DOBLE : COLUMNAS;
}

function miles(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "$ 12.345", "-$ 5.000"; separador de miles '.', sin NBSP ni decimales. */
export function dineroRecibo(n: number): string {
  const entero = Math.round(n);
  if (entero === 0) return '$ 0';
  const texto = `$ ${miles(Math.abs(entero))}`;
  return entero < 0 ? `-${texto}` : texto;
}

/** "+$ 2.000" | "-$ 2.000" | "$ 0". */
export function textoDiferencia(n: number): string {
  const texto = dineroRecibo(n);
  return Math.round(n) > 0 ? `+${texto}` : texto;
}

/** Recorta a `ancho` con "..." (centrado lo hace la impresora con ESC a 1). */
export function recortar(texto: string, ancho: number): string {
  const cars = caracteres(texto);
  if (cars.length <= ancho) return cars.join('');
  if (ancho <= PUNTOS.length) return PUNTOS.slice(0, Math.max(0, ancho));
  return cars.slice(0, ancho - PUNTOS.length).join('').trimEnd() + PUNTOS;
}

/**
 * Izquierda recortada con "..." para que izquierda + ' ' + derecha quepa en `ancho`;
 * derecha completa, alineada al borde derecho.
 */
export function fila(izquierda: string, derecha: string, ancho: number = COLUMNAS): string {
  const der = caracteres(derecha).join('');
  const largoDer = caracteres(der).length;
  if (largoDer >= ancho) return recortar(der, ancho);
  const izq = recortar(izquierda, Math.max(0, ancho - largoDer - 1));
  const espacios = ancho - caracteres(izq).length - largoDer;
  return izq + ' '.repeat(espacios) + der;
}

export function separador(caracter: '-' | '=' = '-'): string {
  return caracter.repeat(COLUMNAS);
}
