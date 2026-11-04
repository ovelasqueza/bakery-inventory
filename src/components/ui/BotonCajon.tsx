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
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-bakery-600 px-4 font-medium text-white',
        'transition-all duration-200 hover:bg-bakery-700 focus:outline-none focus:ring-2 focus:ring-bakery-500 focus:ring-offset-2',
        'active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {/* Ícono de caja registradora */}
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 13h16v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM6 13V8a1 1 0 011-1h10a1 1 0 011 1v5M9 4h6v3H9zM10 16.5h4" />
      </svg>
      <span>{abriendo ? 'Abriendo…' : 'Abrir cajón'}</span>
    </button>
  );
}
