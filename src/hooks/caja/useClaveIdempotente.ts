'use client';

import { useCallback, useRef, useState } from 'react';

export interface ClaveIdempotente {
  /** UUID estable mientras la firma no cambie; un reintento reutiliza la misma clave (Req 17.8). */
  clave: string;
  /** Genera una clave nueva, p. ej. tras un registro exitoso. */
  renovar: () => void;
}

/**
 * UUID v4. `crypto.randomUUID` solo existe en contextos seguros (HTTPS o localhost);
 * si la Caja se abre por HTTP en la red local, se arma con `crypto.getRandomValues`.
 */
export function nuevoUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Clave de idempotencia ligada a `firma` (contenido de lo que se va a registrar).
 * Cambia solo cuando cambia la firma o se llama `renovar()`.
 */
export function useClaveIdempotente(firma: string): ClaveIdempotente {
  const [actual, setActual] = useState(() => ({ firma, clave: nuevoUuid() }));

  const renovar = useCallback(() => {
    setActual((a) => ({ firma: a.firma, clave: nuevoUuid() }));
  }, []);

  // Estado derivado: al cambiar la firma se genera la clave nueva en el mismo render.
  if (actual.firma !== firma) {
    const siguiente = { firma, clave: nuevoUuid() };
    setActual(siguiente);
    return { clave: siguiente.clave, renovar };
  }

  return { clave: actual.clave, renovar };
}

/**
 * Clave de idempotencia pedida en el momento de registrar (Req 6.6).
 * `claveDe(firma)` devuelve la misma clave mientras se pida con la misma firma;
 * con otra firma o tras `renovar()` genera una nueva.
 */
export function useClavePorFirma(): { claveDe: (firma: string) => string; renovar: () => void } {
  const actual = useRef<{ firma: string; clave: string } | null>(null);

  const claveDe = useCallback((firma: string) => {
    if (actual.current === null || actual.current.firma !== firma) {
      actual.current = { firma, clave: nuevoUuid() };
    }
    return actual.current.clave;
  }, []);

  const renovar = useCallback(() => {
    actual.current = null;
  }, []);

  return { claveDe, renovar };
}
