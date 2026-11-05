'use client';

import { useEffect, useState } from 'react';

/** Devuelve `texto` aplicado `ms` milisegundos después del último cambio (Req 4.5: ≤ 300 ms). */
export function useBusquedaDiferida(texto: string, ms = 150): string {
  const [diferido, setDiferido] = useState(texto);

  useEffect(() => {
    const t = window.setTimeout(() => setDiferido(texto), ms);
    return () => window.clearTimeout(t);
  }, [texto, ms]);

  return diferido;
}
