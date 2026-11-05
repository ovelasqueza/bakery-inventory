'use client';

// Calculadora de la Caja (venta por valor): visor grande con el Valor_Digitado encima de un
// teclado numérico grande. "Agregar" pasa el valor a la Lista_Valores (Req 3.1-3.8, 4.1-4.3).
// El estado vive en PuntoVenta; este componente solo despacha acciones.

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import {
  TOTAL_MAX,
  VALORES_MAX,
  VALOR_MAX,
  type AccionCalculadora,
  type AvisoCalculadora,
  type EstadoCalculadora,
  type TeclaCalculadora,
} from '@/lib/caja/calculadora';
import type { LayoutCaja } from '@/lib/caja/layout';

export type ResultadoCalculadora = { estado: EstadoCalculadora; aviso?: AvisoCalculadora };

interface CalculadoraVentaProps {
  estado: EstadoCalculadora;
  /** Aplica la acción a la Calculadora y devuelve el resultado (con su aviso, si lo hay). */
  despachar: (accion: AccionCalculadora) => ResultadoCalculadora;
  /**
   * Cobrar la Lista_Valores. El botón "Cobrar" vive en PanelValores (también en móvil, en su
   * barra inferior); la prop se conserva por el contrato del diseño.
   */
  onCobrar: () => void;
  /** Si se pasa, fija el tamaño de teclas y visor; si no, se usan los quiebres de Tailwind. */
  layout?: LayoutCaja;
  /** Espacio libre al final del scroll, en px, para que el botón flotante no tape "Agregar" (Req 4.6). */
  reservaInferior?: number;
  /** Mientras se registra un cobro directo, las teclas (pantalla y físico) no tienen efecto (Req 6.7). */
  registrando?: boolean;
  /** Vuelve a la venta por productos (cuadrícula). */
  onVolver?: () => void;
}

const miles = (v: number) => new Intl.NumberFormat('es-CO').format(v);

/** Texto del aviso de un límite de la Calculadora (Req 3.5, 4.3). */
export function textoAvisoCalculadora(aviso: AvisoCalculadora): string {
  switch (aviso) {
    case 'VALOR_MAXIMO':
      return `Cada valor puede ser de máximo $${miles(VALOR_MAX)}`;
    case 'VALORES_MAXIMOS':
      return `Máximo ${VALORES_MAX} valores por venta`;
    case 'TOTAL_MAXIMO':
      return `El total no puede pasar de $${miles(TOTAL_MAX)}`;
    case 'VACIO':
      return 'Escriba un valor para cobrar';
  }
}

const TECLAS: TeclaCalculadora[] = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '000', '0', 'retroceso'];

const TARJETA =
  'rounded-2xl border border-lz-border bg-lz-surface shadow-lz-soft transition active:scale-[0.97] active:bg-lz-sage-light hover:border-lz-sage-tint disabled:opacity-40';

/** En un campo de texto lo que se escribe no es para la Calculadora (misma regla que PanelCobro). */
function enCampoDeTexto(objetivo: EventTarget | null): boolean {
  const el = objetivo as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

const ICONO_RETROCESO = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
    <path d="M17 9l-5 5M12 9l5 5" />
  </svg>
);

const ICONO_MAS = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export function CalculadoraVenta({ estado, despachar, layout, reservaInferior, registrando = false, onVolver }: CalculadoraVentaProps) {
  const { showToast } = useToast();
  const { digitado } = estado;

  // Refs para que el teclado físico no se vuelva a suscribir en cada tecla.
  const despacharRef = useRef(despachar);
  despacharRef.current = despachar;
  const toastRef = useRef(showToast);
  toastRef.current = showToast;
  const registrandoRef = useRef(registrando);
  registrandoRef.current = registrando;

  const aplicar = (accion: AccionCalculadora) => {
    if (registrandoRef.current) return;
    const r = despacharRef.current(accion);
    if (r.aviso && r.aviso !== 'VACIO') toastRef.current(textoAvisoCalculadora(r.aviso), 'warning');
  };
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;

  // Teclado físico: dígitos, Retroceso, Supr (borrar) y Enter (agregar) (Req 3.8).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || enCampoDeTexto(e.target)) return;
      let accion: AccionCalculadora | null = null;
      if (/^\d$/.test(e.key)) accion = { tipo: 'tecla', tecla: e.key as TeclaCalculadora };
      else if (e.key === 'Backspace') accion = { tipo: 'tecla', tecla: 'retroceso' };
      else if (e.key === 'Delete') accion = { tipo: 'tecla', tecla: 'borrar' };
      else if (e.key === 'Enter') accion = { tipo: 'agregar' };
      if (!accion) return;
      e.preventDefault();
      if (registrandoRef.current) return;
      aplicarRef.current(accion);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  const escritorio = layout ? layout.modo === 'escritorio' : null;
  const altoTecla = escritorio === null ? 'min-h-[48px] md:min-h-[56px]' : escritorio ? 'min-h-[56px]' : 'min-h-[48px]';
  const letraVisor = escritorio === null ? 'text-4xl md:text-5xl' : escritorio ? 'text-5xl' : 'text-4xl';

  return (
    <section
      aria-label="Calculadora"
      className="flex h-full min-h-0 flex-col overflow-y-auto p-4"
      style={reservaInferior !== undefined ? { paddingBottom: reservaInferior } : undefined}
    >
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3">
        {onVolver && (
          <button
            type="button"
            onClick={onVolver}
            disabled={registrando}
            className="flex min-h-[48px] w-fit shrink-0 items-center gap-2 rounded-2xl border-2 border-lz-border bg-lz-surface px-4 text-base font-semibold text-lz-charcoal transition-colors hover:bg-lz-sage-light hover:text-lz-sage disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Volver a productos
          </button>
        )}

        {/* Visor del Valor_Digitado (Req 3.3) */}
        <div className="relative shrink-0 rounded-2xl border-2 border-lz-sage bg-lz-surface px-4 py-3 shadow-lz-soft">
          <p className="text-xs font-bold tracking-wider text-lz-charcoal-muted">VALOR</p>
          <p
            aria-live="polite"
            aria-label={`Valor digitado: ${formatCurrency(digitado)}`}
            className={`truncate text-right font-lz-display font-bold tabular-nums ${letraVisor} ${
              digitado ? 'text-lz-charcoal' : 'text-lz-charcoal-muted'
            }`}
          >
            {formatCurrency(digitado)}
            <span className="ml-0.5 inline-block w-0.5 animate-pulse bg-lz-sage align-middle" style={{ height: '0.9em' }} aria-hidden="true" />
          </p>
        </div>

        {/* Teclado (Req 3.2, 3.4, 3.6) */}
        <div className="grid min-h-[16rem] flex-1 grid-cols-3 grid-rows-4 gap-2" role="group" aria-label="Teclado numérico">
          {TECLAS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => aplicar({ tipo: 'tecla', tecla: t })}
              disabled={registrando || (t === 'retroceso' && digitado === 0)}
              aria-label={t === 'retroceso' ? 'Borrar último dígito' : t}
              className={`flex min-w-[44px] items-center justify-center font-lz-display text-3xl font-bold text-lz-charcoal tabular-nums ${altoTecla} ${TARJETA}`}
            >
              {t === 'retroceso' ? ICONO_RETROCESO : t}
            </button>
          ))}
        </div>

        {/* Borrar (C) y Agregar (Req 3.7, 4.1) */}
        <div className="grid shrink-0 grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => aplicar({ tipo: 'tecla', tecla: 'borrar' })}
            disabled={registrando || digitado === 0}
            aria-label="Borrar valor digitado"
            title="Borrar"
            className={`flex min-w-[44px] items-center justify-center font-lz-display text-3xl font-bold text-lz-danger ${altoTecla} ${TARJETA}`}
          >
            C
          </button>
          <button
            type="button"
            onClick={() => aplicar({ tipo: 'agregar' })}
            disabled={registrando || digitado === 0}
            className="col-span-2 flex min-h-[64px] min-w-[44px] items-center justify-center gap-2 rounded-2xl border-2 border-lz-sage bg-lz-sage-light font-lz-display text-2xl font-bold text-lz-sage-dark shadow-lz-soft transition hover:bg-lz-sage-tint active:scale-[0.98] active:bg-lz-sage active:text-lz-surface disabled:border-lz-border disabled:bg-lz-sand disabled:text-lz-charcoal-muted disabled:shadow-none"
          >
            {ICONO_MAS}
            Agregar
          </button>
        </div>
      </div>
    </section>
  );
}

export default CalculadoraVenta;
