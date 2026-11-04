'use client';

import { useState } from 'react';
import { abrirCajonSinPapel } from '@/lib/cajon';
import { cn } from '@/lib/utils';
import { useToast } from './Toast';

/** Botón que abre el cajón monedero con el agente del equipo (ver herramientas/cajon/LEEME.md). */
export function BotonCajon({ className }: { className?: string }) {
  const { showToast } = useToast();
  const [abriendo, setAbriendo] = useState(false);

  async function abrir() {
    if (abriendo) return;
    setAbriendo(true);
    const ok = await abrirCajonSinPapel();
    setAbriendo(false);
    if (ok) showToast('Cajón abierto', 'success');
    else showToast('No se pudo abrir el cajón. Revisa que el programa del cajón esté instalado en este equipo', 'error');
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={abriendo}
      aria-label="Abrir cajón"
      title="Abrir cajón"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-bakery-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-bakery-700 shadow-sm backdrop-blur-sm',
        'transition-all duration-200 hover:border-bakery-300 hover:bg-bakery-50 focus:outline-none focus:ring-2 focus:ring-bakery-400 focus:ring-offset-1',
        'active:scale-95 disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
    >
      {/* Ícono de caja registradora */}
      <svg className={cn('h-4 w-4', abriendo && 'animate-pulse')} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 13h16v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM6 13V8a1 1 0 011-1h10a1 1 0 011 1v5M9 4h6v3H9zM10 16.5h4" />
      </svg>
      <span>Cajón</span>
    </button>
  );
}
