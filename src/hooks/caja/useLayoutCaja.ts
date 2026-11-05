'use client';

// Medidas de la pantalla de Caja según la ventana. Solo calcula el layout (Req 9.1, 9.2, 9.9, 9.10).

import { useEffect, useLayoutEffect, useState } from 'react';
import { calcularLayout, type LayoutCaja } from '@/lib/caja/layout';

/** Espera tras el último `resize`/`orientationchange` antes de recalcular (≤ 200 ms, Req 9.2). */
export const ESPERA_RECALCULO_MS = 150;

// useLayoutEffect en el navegador; useEffect en el servidor para evitar la advertencia de SSR.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function medir(): LayoutCaja {
  return calcularLayout(window.innerWidth, window.innerHeight);
}

/** Devuelve el layout de Caja, o `null` en el servidor y en el primer render. */
export function useLayoutCaja(): LayoutCaja | null {
  const [layout, setLayout] = useState<LayoutCaja | null>(null);

  useIsomorphicLayoutEffect(() => {
    // Medición inicial antes del primer pintado de la cuadrícula.
    setLayout(medir());

    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const alCambiar = () => {
      if (temporizador !== null) clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        temporizador = null;
        setLayout(medir());
      }, ESPERA_RECALCULO_MS);
    };

    window.addEventListener('resize', alCambiar);
    window.addEventListener('orientationchange', alCambiar);

    return () => {
      window.removeEventListener('resize', alCambiar);
      window.removeEventListener('orientationchange', alCambiar);
      if (temporizador !== null) clearTimeout(temporizador);
    };
  }, []);

  return layout;
}
