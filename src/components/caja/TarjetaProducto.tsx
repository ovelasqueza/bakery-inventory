'use client';

// Tarjeta de producto: toda la tarjeta es el botón que lo agrega al carrito (Req 4.3, 9.8).
// En autoconsumo va en ámbar y sin precio para no confundirse con la venta (modo-autoconsumo Req 2.2-2.5).

import { formatCurrency } from '@/lib/utils';
import type { ProductoCaja } from '@/lib/caja/busqueda';
import { ImagenProducto } from './ImagenProducto';

/** Lista a la que suma la cuadrícula: Pedido_Productos o Seleccion_Autoconsumo. */
export type ModoLista = 'venta' | 'autoconsumo';

interface TarjetaProductoProps {
  producto: ProductoCaja;
  /** Cantidad del producto en la lista activa (0 o ausente: no está). */
  cantidad?: number;
  onAgregar: (producto: ProductoCaja) => void;
  /** Por defecto 'venta' (sin cambios). */
  modo?: ModoLista;
}

const CLASES_TARJETA: Record<ModoLista, string> = {
  venta:
    'border border-lz-border hover:border-lz-sage-tint focus-visible:ring-lz-sage active:bg-lz-sage-light',
  autoconsumo:
    'border-2 border-lz-amber hover:border-lz-amber-warm focus-visible:ring-lz-amber active:bg-lz-amber-light',
};

const CLASES_INSIGNIA: Record<ModoLista, string> = {
  venta: 'bg-lz-amber',
  autoconsumo: 'bg-lz-charcoal',
};

function etiquetaTarjeta(nombre: string, precio: string, cantidad: number, modo: ModoLista): string {
  if (modo === 'autoconsumo') {
    return cantidad > 0
      ? `Agregar ${nombre} al autoconsumo. Seleccionados: ${cantidad}`
      : `Agregar ${nombre} al autoconsumo`;
  }
  return cantidad > 0 ? `Agregar ${nombre}, ${precio}. En el carrito: ${cantidad}` : `Agregar ${nombre}, ${precio}`;
}

export function TarjetaProducto({ producto, cantidad = 0, onAgregar, modo = 'venta' }: TarjetaProductoProps) {
  const precio = formatCurrency(producto.precio);
  const etiqueta = etiquetaTarjeta(producto.nombre, precio, cantidad, modo);
  const autoconsumo = modo === 'autoconsumo';

  return (
    <button
      type="button"
      onClick={() => onAgregar(producto)}
      aria-label={etiqueta}
      className={`group relative flex min-h-[44px] w-full min-w-[44px] select-none flex-col overflow-hidden rounded-2xl bg-lz-surface p-2 text-left shadow-lz-card transition duration-100 hover:shadow-lz-float focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-lz-linen active:scale-[0.97] ${CLASES_TARJETA[modo]}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-lz-oat">
        <ImagenProducto nombre={producto.nombre} imagenUrl={producto.imagenUrl} />
        {cantidad > 0 && (
          <span
            className={`absolute right-1.5 top-1.5 flex h-7 min-w-[28px] items-center justify-center rounded-full px-2 font-lz-display text-sm font-bold text-lz-surface shadow-lz-soft ${CLASES_INSIGNIA[modo]}`}
            aria-hidden="true"
          >
            {cantidad}
          </span>
        )}
      </div>

      <span className="mt-2 line-clamp-2 min-h-[2.5rem] px-1 text-sm font-semibold leading-5 text-lz-charcoal">
        {producto.nombre}
      </span>

      {autoconsumo ? (
        <span className="mt-auto flex items-center justify-end gap-2 px-1 pb-0.5 pt-1">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lz-amber text-xl font-bold leading-none text-lz-charcoal transition-colors group-hover:bg-lz-amber-warm"
            aria-hidden="true"
          >
            +
          </span>
        </span>
      ) : (
        <span className="mt-auto flex items-center justify-between gap-2 px-1 pb-0.5 pt-1">
          <span className="truncate font-lz-display text-lg font-bold text-lz-sage-dark">{precio}</span>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lz-sage text-xl font-bold leading-none text-lz-surface transition-colors group-hover:bg-lz-sage-medium"
            aria-hidden="true"
          >
            +
          </span>
        </span>
      )}
    </button>
  );
}
