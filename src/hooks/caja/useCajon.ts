'use client';

import { useCallback } from 'react';
import { abrirCajonSinPapel } from '@/lib/cajon';
import { useToast } from '@/components/ui';

export type EventoCajon = 'cobro_efectivo' | 'turno';

export interface OpcionesCajon {
  /** Parámetro `cajon_al_cobrar` (obtenerParametrosCaja). */
  cajonAlCobrar: boolean;
  /** Parámetro `cajon_en_turno` (obtenerParametrosCaja). */
  cajonEnTurno: boolean;
}

/**
 * Abre el cajón monedero según los parámetros de la caja.
 * - Si la opción del evento está desactivada no llama al agente (Req 14.11).
 * - Si el agente no abre el cajón, muestra un aviso sin bloquear el flujo (Req 2.9, 3.10, 6.14).
 */
export function useCajon({ cajonAlCobrar, cajonEnTurno }: OpcionesCajon) {
  const { showToast } = useToast();

  const abrirSiCorresponde = useCallback(
    async (evento: EventoCajon): Promise<void> => {
      const activo = evento === 'cobro_efectivo' ? cajonAlCobrar : cajonEnTurno;
      if (!activo) return;
      const ok = await abrirCajonSinPapel();
      if (!ok) showToast('El cajón no se abrió', 'warning');
    },
    [cajonAlCobrar, cajonEnTurno, showToast]
  );

  return { abrirSiCorresponde };
}
