/**
 * Validaciones puras de formularios de Caja y del Módulo de Parametrización.
 * Sin dependencias de React ni de Supabase.
 */
import { normalizarTexto } from './busqueda';

/** Longitud en caracteres (puntos de código), igual que char_length de PostgreSQL. */
function longitud(s: string): number {
  return Array.from(s).length;
}

const MAX_NOMBRE_PERSONA = 60;

/** Nombre de Persona_Caja: sin espacios al inicio ni al final, de 1 a 60 caracteres. */
export function validarNombrePersona(
  s: string
): { ok: true; valor: string } | { ok: false; error: 'VACIO' | 'LARGO' } {
  const valor = s.trim();
  if (valor.length === 0) return { ok: false, error: 'VACIO' };
  if (longitud(valor) > MAX_NOMBRE_PERSONA) return { ok: false, error: 'LARGO' };
  return { ok: true, valor };
}

const SOLO_DIGITOS = /^\d+$/;

/**
 * Entero escrito en un campo de texto. Acepta solo dígitos (sin signos, puntos ni
 * comas) después de quitar espacios. "-5" da NO_ENTERO.
 */
export function validarEnteroEnRango(
  texto: string,
  min: number,
  max: number
): { ok: true; valor: number } | { ok: false; error: 'VACIO' | 'NO_ENTERO' | 'RANGO' } {
  const t = texto.trim();
  if (t.length === 0) return { ok: false, error: 'VACIO' };
  if (!SOLO_DIGITOS.test(t)) return { ok: false, error: 'NO_ENTERO' };
  const valor = Number(t);
  if (!Number.isSafeInteger(valor) || valor < min || valor > max) {
    return { ok: false, error: 'RANGO' };
  }
  return { ok: true, valor };
}

/** Texto libre (concepto, motivo, nombre de catálogo) contado después de quitar espacios. */
export function validarTextoLargo(
  s: string,
  min: number,
  max: number
): { ok: true; valor: string } | { ok: false; error: 'CORTO' | 'LARGO' } {
  const valor = s.trim();
  const n = longitud(valor);
  if (n < min) return { ok: false, error: 'CORTO' };
  if (n > max) return { ok: false, error: 'LARGO' };
  return { ok: true, valor };
}

/**
 * ¿El nombre ya existe en el catálogo? Compara sin distinguir mayúsculas,
 * minúsculas ni tildes, e ignora el registro propio al editar.
 */
export function nombreRepetido(
  nombre: string,
  existentes: { id: string; nombre: string }[],
  idPropio?: string
): boolean {
  const buscado = normalizarTexto(nombre);
  return existentes.some(
    (e) => e.id !== idPropio && normalizarTexto(e.nombre) === buscado
  );
}

export type CambioMetodo = { id: string; activo?: boolean; esEfectivo?: boolean };

/**
 * ¿Después de aplicar el cambio queda al menos un Metodo_Pago activo de efectivo?
 * Si el id no existe en la lista, el cambio se trata como un método nuevo
 * (activo por defecto, no efectivo por defecto).
 */
export function puedeAplicarCambioMetodo(
  metodos: { id: string; activo: boolean; esEfectivo: boolean }[],
  cambio: CambioMetodo
): boolean {
  let encontrado = false;
  const resultado = metodos.map((m) => {
    if (m.id !== cambio.id) return m;
    encontrado = true;
    return {
      ...m,
      activo: cambio.activo ?? m.activo,
      esEfectivo: cambio.esEfectivo ?? m.esEfectivo,
    };
  });
  if (!encontrado) {
    resultado.push({
      id: cambio.id,
      activo: cambio.activo ?? true,
      esEfectivo: cambio.esEfectivo ?? false,
    });
  }
  return resultado.some((m) => m.activo && m.esEfectivo);
}
