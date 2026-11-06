'use client';

// Confirmación grande de venta registrada: total, cambio y botón opcional para imprimir tiquete.
// Por defecto nunca imprime; solo imprime si el cajero toca "Imprimir tiquete".

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { imprimirReciboVenta, mensajeImpresionVenta } from '@/lib/recibo/reciboVenta';
import { formatCurrency } from '@/lib/utils';

export const DURACION_CONFIRMACION_MS = 5000;

export interface DatosConfirmacionVenta {
  ventaId?: string;
  total: number;
  cambio: number | null;
  metodoNombre?: string | null;
  yaImpreso?: boolean;
}

interface ConfirmacionVentaProps {
  venta: DatosConfirmacionVenta | null;
  onCerrar: () => void;
}

export function ConfirmacionVenta({ venta, onCerrar }: ConfirmacionVentaProps) {
  const { showToast } = useToast();
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    setImprimiendo(false);
  }, [venta]);

  useEffect(() => {
    if (!venta || imprimiendo) return;
    const t = window.setTimeout(() => cerrarRef.current(), DURACION_CONFIRMACION_MS);
    return () => window.clearTimeout(t);
  }, [venta, imprimiendo]);

  if (!venta) return null;

  async function alImprimir() {
    if (!venta?.ventaId || imprimiendo) return;
    setImprimiendo(true);
    try {
      const r = await imprimirReciboVenta(venta.ventaId, venta.metodoNombre);
      showToast(mensajeImpresionVenta(r), r.ok ? 'success' : 'warning');
    } finally {
      setImprimiendo(false);
      cerrarRef.current();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Venta registrada"
      onClick={(e) => {
        if (e.target === e.currentTarget && !imprimiendo) cerrarRef.current();
      }}
      className="fixed inset-0 z-[60] flex h-full w-full items-center justify-center bg-lz-sage-dark/90 p-6"
    >
      <div
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

        <div className="mt-2 flex w-full flex-wrap gap-3">
          {venta.ventaId && !venta.yaImpreso && (
            <button
              type="button"
              onClick={() => void alImprimir()}
              disabled={imprimiendo}
              className="flex min-h-[54px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-lz-sage bg-lz-sage-light px-4 font-lz-display text-base font-bold text-lz-sage-dark transition-colors hover:bg-lz-sage hover:text-lz-surface disabled:opacity-50"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              {imprimiendo ? 'Imprimiendo…' : 'Imprimir tiquete'}
            </button>
          )}
          <button
            type="button"
            onClick={() => cerrarRef.current()}
            disabled={imprimiendo}
            className="flex min-h-[54px] flex-1 items-center justify-center rounded-2xl bg-lz-sage px-5 font-lz-display text-base font-bold text-lz-surface transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmacionVenta;
