'use client';

// Cuadrícula de productos con el número de columnas del Gestor_Layout; solo ella se desplaza (Req 4.1, 9.6, 9.7).

import type { ProductoCaja } from '@/lib/caja/busqueda';
import { MEDIDAS } from '@/lib/caja/layout';
import { TarjetaProducto, type ModoLista } from './TarjetaProducto';

interface CuadriculaProductosProps {
  productos: ProductoCaja[];
  columnas: number;
  /** Cantidad en la lista activa por id de producto. */
  cantidades?: Map<string, number>;
  onAgregar: (producto: ProductoCaja) => void;
  /** Abre el popup de venta rápida por dinero ($) o promoción desde el botón superior izquierdo. */
  onAbrirPorMonto?: (producto: ProductoCaja) => void;
  /** Espacio libre al final del scroll, en px, para que el botón flotante no tape la última fila (Req 4.6). */
  reservaInferior?: number;
  /** Lista a la que suman las tarjetas; por defecto 'venta' (modo-autoconsumo Req 2.2-2.5). */
  modo?: ModoLista;
}

export function CuadriculaProductos({
  productos,
  columnas,
  cantidades,
  onAgregar,
  onAbrirPorMonto,
  reservaInferior,
  modo = 'venta',
}: CuadriculaProductosProps) {
  return (
    <div
      className="h-full overflow-y-auto overscroll-contain"
      style={reservaInferior !== undefined ? { paddingBottom: reservaInferior } : undefined}
    >
      <ul
        className="grid content-start"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, columnas)}, minmax(0, 1fr))`,
          gap: MEDIDAS.gap,
          padding: MEDIDAS.padding,
        }}
        aria-label="Productos"
      >
        {productos.map((p) => (
          <li key={p.id} className="flex">
            <TarjetaProducto
              producto={p}
              cantidad={cantidades?.get(p.id) ?? 0}
              onAgregar={onAgregar}
              onAbrirPorMonto={onAbrirPorMonto}
              modo={modo}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
