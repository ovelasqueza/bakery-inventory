'use client';

// Confirmación grande de venta registrada: total y cambio; se cierra a los 3 s o al tocarla (Req 6.9).
// Con cambio null (cobro directo de la Calculadora) solo se muestra el total.

import { useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/utils';

export const DURACION_CONFIRMACION_MS = 3000;

interface ConfirmacionVentaProps {
  venta: { total: number; cambio: number | null } | null;
  onCerrar: () => void;
}

export function ConfirmacionVenta({ venta, onCerrar }: ConfirmacionVentaProps) {
  // La referencia evita reiniciar el temporizador si el padre pasa un onCerrar nuevo en cada render.
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  useEffect(() => {
    if (!venta) return;
    const t = window.setTimeout(() => cerrarRef.current(), DURACION_CONFIRMACION_MS);
    return () => window.clearTimeout(t);
  }, [venta]);

  if (!venta) return null;

  return (
    <button
      type="button"
      onClick={() => cerrarRef.current()}
      aria-label="Venta registrada. Toque para continuar"
      className="fixed inset-0 z-[60] flex h-full w-full items-center justify-center bg-lz-sage-dark/90 p-6 focus:outline-none"
    >
      <span
        role="status"
        aria-live="assertive"
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-lz-surface px-6 py-8 text-center shadow-lz-float"
      >
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-lz-sage text-lz-surface">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-12 w-12"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="font-lz-display text-2xl font-bold text-lz-sage-dark">Venta registrada</span>
        <span className="flex flex-col">
          <span className="text-sm font-medium text-lz-charcoal-muted">Total</span>
          <span className="font-lz-display text-4xl font-bold text-lz-charcoal">{formatCurrency(venta.total)}</span>
        </span>
        {venta.cambio !== null && (
          <span className="flex w-full flex-col rounded-2xl bg-lz-amber-light px-4 py-3">
            <span className="text-sm font-medium text-lz-charcoal-muted">Cambio</span>
            <span className="font-lz-display text-5xl font-bold text-lz-amber">{formatCurrency(venta.cambio)}</span>
          </span>
        )}
        <span className="text-sm text-lz-charcoal-muted">Toque para continuar</span>
      </span>
    </button>
  );
}

export default ConfirmacionVenta;
