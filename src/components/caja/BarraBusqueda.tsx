'use client';

// Buscador del catálogo y cinta de categorías con "Todas" primero (Req 4.5, 4.6).

import type { CategoriaCaja } from '@/lib/api/ventas';

export const MAX_BUSQUEDA = 50;

interface BarraBusquedaProps {
  texto: string;
  onTexto: (texto: string) => void;
  categorias: CategoriaCaja[];
  categoriaId: string | 'todas';
  onCategoria: (categoriaId: string | 'todas') => void;
}

export function BarraBusqueda({ texto, onTexto, categorias, categoriaId, onCategoria }: BarraBusquedaProps) {
  const opciones: { id: string | 'todas'; nombre: string }[] = [
    { id: 'todas', nombre: 'Todas' },
    ...categorias,
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex items-center rounded-2xl border border-lz-border bg-lz-surface shadow-lz-soft focus-within:border-lz-sage focus-within:ring-2 focus-within:ring-lz-sage-tint">
        <svg
          className="pointer-events-none absolute left-4 h-5 w-5 text-lz-charcoal-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={texto}
          onChange={(e) => onTexto(e.target.value.slice(0, MAX_BUSQUEDA))}
          maxLength={MAX_BUSQUEDA}
          placeholder="Buscar producto"
          aria-label="Buscar producto"
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 w-full rounded-2xl bg-transparent pl-12 pr-14 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {texto !== '' && (
          <button
            type="button"
            onClick={() => onTexto('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-1 flex h-11 w-11 items-center justify-center rounded-xl text-lz-charcoal-muted transition hover:bg-lz-oat active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label="Categoría"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {opciones.map((c) => {
          const activa = c.id === categoriaId;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => onCategoria(c.id)}
              className={`h-11 min-w-[44px] shrink-0 whitespace-nowrap rounded-xl border px-4 text-sm font-semibold transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage focus-visible:ring-offset-1 ${
                activa
                  ? 'border-lz-sage bg-lz-sage text-lz-surface shadow-lz-soft'
                  : 'border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-sage-light'
              }`}
            >
              {c.nombre}
            </button>
          );
        })}
      </div>
    </div>
  );
}
