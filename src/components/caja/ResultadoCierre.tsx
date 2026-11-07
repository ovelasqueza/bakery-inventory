'use client';

// Resultado del cierre a ciegas: quién cerró, hora, base que quedó y enviado a caja mayor (Req 1.6).
// Al aparecer imprime el Recibo_Cierre una vez y permite reimprimirlo (Req 5.1-5.9).

import { useId } from 'react';
import { useImprimirRecibo } from '@/hooks/caja/useImprimirRecibo';
import type { Cierre } from '@/lib/api/turnos';
import { hora12 } from '@/lib/fechas/bogota';
import { formatCurrency } from '@/lib/utils';

interface ResultadoCierreProps {
  cierre: Cierre;
  /** Turno que se cerró; su recibo se imprime al aparecer. */
  turnoId: string;
  /** Quien llama muestra la apertura de turno. */
  onContinuar: () => void;
}

export function ResultadoCierre({ cierre, turnoId, onContinuar }: ResultadoCierreProps) {
  const idTitulo = useId();
  const { estado, mensaje, imprimir } = useImprimirRecibo(turnoId, true);
  const imprimiendo = estado === 'imprimiendo';
  const textoEstado = imprimiendo ? 'Imprimiendo recibo…' : mensaje ?? '';
  const colorEstado =
    estado === 'listo' ? 'text-lz-sage-dark' : estado === 'fallo' ? 'text-lz-danger' : 'text-lz-charcoal-muted';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-lz-linen p-4 font-lz-sans text-lz-charcoal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
    >
      <div className="flex w-full max-w-lg flex-col gap-6 rounded-3xl border border-lz-border bg-lz-surface p-6 shadow-lz-soft sm:p-8">
        <div role="status" className="flex flex-col gap-1 text-center">
          <h2 id={idTitulo} className="font-lz-display text-2xl font-bold text-lz-charcoal">
            Turno cerrado
          </h2>
          <p className="text-base text-lz-charcoal-muted">
            Cerró {cierre.cerradoPor} a las {hora12(cierre.cerradoEn)}
          </p>
        </div>

        <dl className="flex flex-col divide-y divide-lz-border">
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="font-lz-display text-base font-bold">Enviado a caja mayor</dt>
            <dd className="font-lz-display text-2xl font-bold tabular-nums">
              {formatCurrency(cierre.enviadoMayor)}
            </dd>
          </div>
        </dl>

        <p role="status" className={`min-h-[1.5rem] text-center text-base font-semibold ${colorEstado}`}>
          {textoEstado}
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={imprimir}
            disabled={imprimiendo}
            className="min-h-[56px] w-full rounded-2xl border border-lz-border bg-lz-surface px-6 font-lz-display text-lg font-bold text-lz-charcoal transition-colors hover:bg-lz-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Imprimir recibo
          </button>

          <button
            type="button"
            onClick={onContinuar}
            autoFocus
            className="min-h-[56px] w-full rounded-2xl bg-lz-sage px-6 font-lz-display text-xl font-bold text-lz-surface transition-colors hover:bg-lz-sage-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage focus-visible:ring-offset-2"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResultadoCierre;
