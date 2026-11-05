'use client';

// Grupo_Acciones: 6 botones iguales dentro del Encabezado_Caja, separados 8 px (Req 1.1, 1.3, 1.6, 1.8, 1.9, 1.10, 3.1, 3.2).

import type { ReactNode } from 'react';
import { ENCABEZADO, type LayoutCaja } from '@/lib/caja/layout';

export type AccionCaja = 'ventas' | 'gastos' | 'retiro' | 'autoconsumo' | 'calculadora' | 'cerrar';

interface BarraAccionesCajaProps {
  layout: LayoutCaja;
  /** Acción cuya vista está abierta; se resalta con tono activo y `aria-pressed`. */
  activo: AccionCaja | null;
  onAccion: (a: AccionCaja) => void;
}

function Icono({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ICONO_VENTAS = (
  <Icono>
    <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
    <circle cx="10" cy="20.5" r="1" />
    <circle cx="17" cy="20.5" r="1" />
  </Icono>
);

const ICONO_GASTOS = (
  <Icono>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M7 12h.01M17 12h.01" />
  </Icono>
);

const ICONO_RETIRO = (
  <Icono>
    <rect x="3" y="10" width="18" height="10" rx="2" />
    <circle cx="12" cy="15" r="2" />
    <path d="M12 3v5M9.5 5.5 12 8l2.5-2.5" />
  </Icono>
);

/** Taza con vapor: consumo de la casa. */
const ICONO_AUTOCONSUMO = (
  <Icono>
    <path d="M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5z" />
    <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
    <path d="M8 3v3M12 3v3" />
  </Icono>
);

const ICONO_CALCULADORA = (
  <Icono>
    <rect x="5" y="2.5" width="14" height="19" rx="2" />
    <path d="M8 6.5h8v3H8z" />
    <path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 17h.01M12 17h.01M15.5 17h.01" />
  </Icono>
);

const ICONO_CERRAR = (
  <Icono>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Icono>
);

type Tono = 'normal' | 'activo' | 'peligro';

const TONOS: Record<Tono, string> = {
  normal: 'border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-sage-light hover:text-lz-sage',
  activo: 'border-lz-sage bg-lz-sage text-lz-surface',
  peligro: 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-danger-border hover:bg-lz-danger-surface hover:text-lz-danger',
};

const ACCIONES: ReadonlyArray<{ accion: AccionCaja; texto: string; icono: ReactNode }> = [
  { accion: 'ventas', texto: 'Ventas', icono: ICONO_VENTAS },
  { accion: 'gastos', texto: 'Gastos/Pedidos', icono: ICONO_GASTOS },
  { accion: 'retiro', texto: 'Retiros', icono: ICONO_RETIRO },
  { accion: 'autoconsumo', texto: 'Autoconsumo', icono: ICONO_AUTOCONSUMO },
  { accion: 'calculadora', texto: 'Calculadora', icono: ICONO_CALCULADORA },
  { accion: 'cerrar', texto: 'Cerrar turno', icono: ICONO_CERRAR },
];

export function BarraAccionesCaja({ layout, activo, onAccion }: BarraAccionesCajaProps) {
  const ancho = layout.anchoBotonAccion;
  const gap = ENCABEZADO.gap;

  return (
    <nav
      aria-label="Acciones de caja"
      className="grid shrink-0 grid-cols-6 items-center"
      style={{ columnGap: gap, width: ENCABEZADO.botones * ancho + (ENCABEZADO.botones - 1) * gap }}
    >
      {ACCIONES.map(({ accion, texto, icono }) => {
        const esActivo = activo === accion;
        const tono: Tono = esActivo ? 'activo' : accion === 'cerrar' ? 'peligro' : 'normal';
        return (
          <button
            key={accion}
            type="button"
            onClick={() => onAccion(accion)}
            aria-label={texto}
            title={texto}
            aria-pressed={esActivo ? true : undefined}
            className={`inline-flex min-w-[44px] items-center justify-center gap-1.5 overflow-hidden rounded-2xl border px-1 font-semibold transition-colors ${TONOS[tono]}`}
            style={{ width: ancho, height: ENCABEZADO.altoBoton, minHeight: ENCABEZADO.toqueMin }}
          >
            {icono}
            {layout.textoEnAcciones && (
              <span className="line-clamp-2 min-w-0 text-left text-xs leading-tight lg:text-sm">{texto}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export default BarraAccionesCaja;
