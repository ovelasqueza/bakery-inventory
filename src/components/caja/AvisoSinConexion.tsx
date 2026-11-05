'use client';

// Aviso "Sin conexión" con botón "Reintentar" (Req 17.7).

interface AvisoSinConexionProps {
  onReintentar: () => void;
  /** Texto adicional bajo el título. */
  mensaje?: string;
  /** Deshabilita "Reintentar" mientras se reintenta. */
  reintentando?: boolean;
  className?: string;
}

export function AvisoSinConexion({
  onReintentar,
  mensaje = 'Revise el internet y vuelva a intentar.',
  reintentando = false,
  className = '',
}: AvisoSinConexionProps) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3 ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-6 w-6 shrink-0 text-lz-danger"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.9 5.2A15 15 0 0 1 22 8.8M5 12.6a10 10 0 0 1 3.1-1.8M12.9 10.5A10 10 0 0 1 19 12.6M8.5 16.4a5 5 0 0 1 7 0" />
        <path d="M12 20h.01M3 3l18 18" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-lz-display text-base font-bold text-lz-danger">Sin conexión</p>
        {mensaje && <p className="text-sm text-lz-charcoal">{mensaje}</p>}
      </div>
      <button
        type="button"
        onClick={onReintentar}
        disabled={reintentando}
        className="min-h-[44px] min-w-[44px] rounded-xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
      >
        {reintentando ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  );
}

export default AvisoSinConexion;
