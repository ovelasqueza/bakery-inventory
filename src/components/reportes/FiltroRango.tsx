'use client';

// Filtro de rango de fechas del Modulo_Reportes con atajos por Dia_Local (Req 11.4, 11.7, 12.12).

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import {
  atajoRango,
  validarRango,
  type AtajoRango,
  type ErrorRango,
  type Rango,
} from '@/lib/fechas/bogota';

const ATAJOS: { id: AtajoRango; etiqueta: string; etiquetaCorta?: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'ayer', etiqueta: 'Ayer' },
  { id: 'ultimos7', etiqueta: 'Últimos 7 días', etiquetaCorta: '7 días' },
  { id: 'esteMes', etiqueta: 'Este mes' },
  { id: 'mesAnterior', etiqueta: 'Mes anterior', etiquetaCorta: 'Mes ant.' },
];

export const MENSAJES_ERROR_RANGO: Record<ErrorRango, string> = {
  FALTA_FECHA: 'Elija la fecha inicial y la fecha final.',
  INICIO_POSTERIOR: 'La fecha inicial no puede ser posterior a la fecha final.',
  MAS_DE_366: 'El rango no puede superar 366 días.',
};

interface FiltroRangoProps {
  /** Último rango válido aplicado. */
  rango: Rango;
  /** Se llama solo con rangos válidos. */
  onAplicar: (rango: Rango) => void;
}

export function FiltroRango({ rango, onAplicar }: FiltroRangoProps) {
  const idDesde = useId();
  const idHasta = useId();
  const idError = useId();
  const [desde, setDesde] = useState(rango.desde);
  const [hasta, setHasta] = useState(rango.hasta);
  const [error, setError] = useState<ErrorRango | null>(null);

  // Si el rango aplicado cambia desde fuera, se refleja en los campos.
  useEffect(() => {
    setDesde(rango.desde);
    setHasta(rango.hasta);
    setError(null);
  }, [rango.desde, rango.hasta]);

  const atajoActivo = useMemo<AtajoRango | null>(() => {
    const ahora = new Date();
    for (const a of ATAJOS) {
      const r = atajoRango(a.id, ahora);
      if (r.desde === rango.desde && r.hasta === rango.hasta) return a.id;
    }
    return null;
  }, [rango.desde, rango.hasta]);

  function aplicarAtajo(id: AtajoRango) {
    const r = atajoRango(id);
    setDesde(r.desde);
    setHasta(r.hasta);
    setError(null);
    onAplicar(r);
  }

  function aplicarManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = validarRango(desde, hasta);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    onAplicar(res.rango);
  }

  const claseCampo = `min-h-[40px] sm:min-h-[44px] w-full rounded-xl sm:rounded-2xl border-2 bg-lz-surface px-2.5 sm:px-3 text-sm sm:text-base text-lz-charcoal focus:outline-none ${
    error ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
  }`;

  return (
    <section
      aria-label="Filtro de fechas"
      className="flex flex-col gap-2.5 rounded-2xl border border-lz-border bg-lz-surface p-3 shadow-lz-soft sm:gap-3 sm:p-4"
    >
      <div className="flex flex-wrap gap-1.5 sm:gap-2" role="group" aria-label="Atajos de fecha">
        {ATAJOS.map((a) => {
          const activo = atajoActivo === a.id;
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={activo}
              onClick={() => aplicarAtajo(a.id)}
              className={`min-h-[38px] flex-1 whitespace-nowrap rounded-xl border-2 px-2.5 text-xs font-semibold transition-colors sm:min-h-[44px] sm:flex-none sm:rounded-2xl sm:px-4 sm:text-sm ${
                activo
                  ? 'border-lz-sage bg-lz-sage text-lz-surface'
                  : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
              }`}
            >
              <span className="sm:hidden">{a.etiquetaCorta ?? a.etiqueta}</span>
              <span className="hidden sm:inline">{a.etiqueta}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={aplicarManual} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-1 sm:gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={idDesde} className="text-xs font-medium text-lz-charcoal-muted sm:text-sm">
              Desde
            </label>
            <input
              id={idDesde}
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? idError : undefined}
              className={claseCampo}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={idHasta} className="text-xs font-medium text-lz-charcoal-muted sm:text-sm">
              Hasta
            </label>
            <input
              id={idHasta}
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? idError : undefined}
              className={claseCampo}
            />
          </div>
        </div>
        <button
          type="submit"
          className="min-h-[40px] rounded-xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark sm:min-h-[44px] sm:rounded-2xl sm:px-5 sm:text-base"
        >
          Aplicar fechas
        </button>
      </form>

      {error && (
        <p
          id={idError}
          role="alert"
          className="rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-xs font-medium text-lz-danger sm:text-sm"
        >
          {MENSAJES_ERROR_RANGO[error]}
        </p>
      )}
    </section>
  );
}

export default FiltroRango;
