'use client';

// Franja ámbar de la Vista_Autoconsumo: avisa que no es una venta y permite salir o ver
// los autoconsumos del turno (modo-autoconsumo Req 1.1-1.4). Texto oscuro sobre lz-amber por contraste.

interface FranjaAutoconsumoProps {
  /** Vuelve a Vendiendo y conserva la Seleccion_Autoconsumo. */
  onSalir: () => void;
  /** Abre la lista de autoconsumos del turno. */
  onVerTurno: () => void;
}

export function FranjaAutoconsumo({ onSalir, onVerTurno }: FranjaAutoconsumoProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-lz-amber-warm bg-lz-amber px-3 py-2">
      <p role="status" className="min-w-0 flex-1 font-lz-display text-lg font-extrabold text-lz-charcoal">
        MODO AUTOCONSUMO · No es una venta
      </p>
      <button
        type="button"
        onClick={onVerTurno}
        className="min-h-[44px] min-w-[44px] shrink-0 rounded-xl border border-lz-charcoal/20 bg-lz-amber-light px-4 text-sm font-semibold text-lz-charcoal transition-colors hover:bg-lz-surface"
      >
        Autoconsumos del turno
      </button>
      <button
        type="button"
        onClick={onSalir}
        className="min-h-[44px] min-w-[44px] shrink-0 rounded-xl bg-lz-charcoal px-4 text-sm font-bold text-lz-surface transition-colors hover:bg-lz-charcoal/90"
      >
        Salir de autoconsumo
      </button>
    </div>
  );
}
