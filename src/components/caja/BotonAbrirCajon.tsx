'use client';

// Botón grande para abrir el cajón monedero desde la Caja.
// Animación: onda donde se toca, la gaveta del ícono sale, monedas al abrir y sacudida si falla.
// Abre siempre que se toque (es manual), sin importar las opciones automáticas del cajón.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useToast } from '@/components/ui';
import { abrirCajonSinPapel } from '@/lib/cajon';

type Estado = 'listo' | 'abriendo' | 'abierto' | 'error';
type Onda = { id: number; x: number; y: number; radio: number };

const DURACION_RESULTADO_MS = 1600;
const DURACION_ONDA_MS = 650;
/** Desplazamiento horizontal de cada moneda al salir. */
const MONEDAS = [-16, 0, 16];

const TEXTO: Record<Estado, string> = {
  listo: 'Abrir cajón',
  abriendo: 'Abriendo…',
  abierto: '¡Abierto!',
  error: 'No abrió',
};

const COLOR: Record<Estado, string> = {
  listo:
    'bg-gradient-to-br from-lz-amber-warm to-lz-amber text-lz-surface shadow-lz-soft hover:-translate-y-0.5 hover:shadow-lz-float',
  abriendo: 'bg-gradient-to-br from-lz-amber-warm to-lz-amber text-lz-surface shadow-lz-float cursor-wait',
  abierto: 'bg-lz-sage text-lz-surface shadow-lz-float',
  error: 'bg-lz-danger text-lz-surface shadow-lz-soft motion-safe:animate-lz-sacudir',
};

interface BotonAbrirCajonProps {
  /**
   * 'grande': 64 px con texto. 'compacto': 48 × 48 px.
   * 'flotante': redondo de 72 × 72 px, fijo en pantalla según `posicion`.
   */
  variante?: 'grande' | 'compacto' | 'flotante';
  /** Solo para 'flotante': distancia en px a los bordes izquierdo e inferior de la ventana. */
  posicion?: { left: number; bottom: number };
  className?: string;
}

function IconoCajon({ abierto }: { abierto: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 overflow-visible" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {/* Cuerpo de la registradora */}
      <path d="M6 11V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" />
      <path d="M9 7h6" />
      <path d="M4 11h16v3H4z" />
      {/* Gaveta: sale hacia abajo al abrir */}
      <g
        style={{
          transform: `translateY(${abierto ? 5 : 0}px)`,
          transition: 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <rect x="3" y="15" width="18" height="5" rx="1.2" />
        <path d="M10 17.5h4" />
      </g>
    </svg>
  );
}

export function BotonAbrirCajon({ variante = 'flotante', posicion, className = '' }: BotonAbrirCajonProps) {
  const { showToast } = useToast();
  const [estado, setEstado] = useState<Estado>('listo');
  const [ondas, setOndas] = useState<Onda[]>([]);
  const [disparo, setDisparo] = useState(0);
  const ocupado = useRef(false);
  const temporizador = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    [],
  );

  function crearOnda(e: PointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const onda: Onda = {
      id: Date.now() + Math.random(),
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      radio: Math.hypot(r.width, r.height),
    };
    setOndas((o) => [...o, onda]);
    window.setTimeout(() => setOndas((o) => o.filter((x) => x.id !== onda.id)), DURACION_ONDA_MS);
  }

  async function abrir() {
    if (ocupado.current) return;
    ocupado.current = true;
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    navigator.vibrate?.(12);
    setEstado('abriendo');
    const ok = await abrirCajonSinPapel();
    if (ok) {
      setDisparo((n) => n + 1);
      setEstado('abierto');
    } else {
      setEstado('error');
      showToast('No se pudo abrir el cajón. Revise que el programa del cajón esté instalado en este equipo', 'error');
    }
    ocupado.current = false;
    temporizador.current = window.setTimeout(() => setEstado('listo'), DURACION_RESULTADO_MS);
  }

  const grande = variante === 'grande';
  const flotante = variante === 'flotante';
  const gavetaAfuera = estado === 'abriendo' || estado === 'abierto';

  return (
    <button
      type="button"
      onPointerDown={crearOnda}
      onClick={() => void abrir()}
      aria-label="Abrir cajón"
      title="Abrir cajón"
      aria-busy={estado === 'abriendo' || undefined}
      style={flotante && posicion ? { left: posicion.left, bottom: posicion.bottom } : undefined}
      className={`isolate shrink-0 select-none touch-manipulation transition-[transform,box-shadow,background-color] duration-200 active:scale-[0.93] focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-amber focus-visible:ring-offset-2 ${
        flotante
          ? 'fixed z-30 flex h-[72px] w-[72px] items-center justify-center rounded-full [&_svg]:h-9 [&_svg]:w-9'
          : grande
              ? 'relative flex h-16 w-[92px] flex-col items-center justify-center gap-0.5 rounded-2xl'
              : 'relative flex h-12 w-12 items-center justify-center rounded-xl'
      } ${COLOR[estado]} ${className}`}
    >
      {/* Ondas desde el punto de contacto, recortadas a la forma del botón */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
      {ondas.map((o) => (
        <span
          key={o.id}
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-lz-surface/40 motion-safe:animate-lz-onda"
          style={{ left: o.x - o.radio, top: o.y - o.radio, width: o.radio * 2, height: o.radio * 2 }}
        />
      ))}
      </span>

      <span className={`relative flex items-center justify-center ${estado === 'abierto' ? 'motion-safe:animate-lz-aparecer' : ''}`}>
        <IconoCajon abierto={gavetaAfuera} />
        {/* Monedas que saltan al abrir */}
        {estado === 'abierto' &&
          MONEDAS.map((dx, i) => (
            <span
              key={`${disparo}-${i}`}
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-lz-amber bg-lz-amber-light motion-safe:animate-lz-moneda"
              style={{ '--lz-dx': `${dx}px`, animationDelay: `${i * 60}ms` } as CSSProperties}
            />
          ))}
      </span>

      {grande && <span className="font-lz-display text-sm font-bold leading-none tracking-wide">{TEXTO[estado]}</span>}
      <span className="sr-only" role="status" aria-live="polite">
        {estado === 'listo' ? '' : TEXTO[estado]}
      </span>
    </button>
  );
}

export default BotonAbrirCajon;