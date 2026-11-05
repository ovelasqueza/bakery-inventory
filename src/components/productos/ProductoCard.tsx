'use client';

import { Card } from '@/components/ui';
import type { Producto } from '@/types/database';
import { formatCurrency } from '@/lib/utils';
import { ZonaFoto } from './FotoProducto';

interface ProductoCardProps {
  producto: Producto;
  onEdit: (producto: Producto) => void;
  onDelete: (producto: Producto) => void;
  onViewHistory: (producto: Producto) => void;
  /** Se llama cuando la foto se sube o se quita desde la tarjeta. */
  onFotoCambio?: (productoId: string, nuevoPath: string | null) => void;
}

const tipoLabels: Record<string, { label: string; color: string }> = {
  normal: { label: 'Normal', color: 'bg-gray-100 text-gray-700' },
  produccion: { label: 'Producción', color: 'bg-blue-100 text-blue-700' },
  materia_prima: { label: 'Materia Prima', color: 'bg-yellow-100 text-yellow-700' },
};

export function ProductoCard({
  producto,
  onEdit,
  onDelete,
  onViewHistory,
  onFotoCambio,
}: ProductoCardProps) {
  const tipo = producto.tipo_producto || 'normal';
  const tipoInfo = tipoLabels[tipo] || tipoLabels.normal;
  // La materia prima no se vende en la Caja, así que no lleva foto (Req 10.1).
  const conFoto = tipo !== 'materia_prima';

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      {conFoto && (
        <ZonaFoto
          productoId={producto.id}
          nombre={producto.nombre}
          imagenPath={producto.imagen_path ?? null}
          onCambio={(path) => onFotoCambio?.(producto.id, path)}
          className="border-b border-gray-100"
        />
      )}

      <div className="flex flex-1 flex-col p-3">
        <h3
          className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-gray-900"
          title={producto.nombre}
        >
          {producto.nombre}
        </h3>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tipoInfo.color}`}>
            {tipoInfo.label}
          </span>
          {tipo === 'materia_prima' && (
            <div className="min-w-0 text-right">
              <p className="truncate text-base font-bold text-yellow-600">
                {formatCurrency(producto.precio_actual)}
              </p>
              <p className="truncate text-xs text-gray-500">
                /{producto.contenido_por_unidad} {producto.unidad_medida}
              </p>
            </div>
          )}
        </div>

        {tipo !== 'materia_prima' && (
          <dl className="mt-2 space-y-0.5 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-gray-500">Costo</dt>
              <dd className="truncate text-gray-700">{formatCurrency(producto.precio_actual)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs font-medium text-gray-500">Venta</dt>
              {producto.precio_venta !== null && producto.precio_venta !== undefined ? (
                <dd className="truncate text-base font-bold text-bakery-600">
                  {formatCurrency(producto.precio_venta)}
                </dd>
              ) : (
                <dd>
                  <button
                    type="button"
                    onClick={() => onEdit(producto)}
                    className="text-xs font-medium text-red-600 hover:underline"
                    title="Sin precio de venta, no aparece en la Caja"
                  >
                    Sin precio
                  </button>
                </dd>
              )}
            </div>
          </dl>
        )}

        {/* Acciones */}
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-1 border-t border-gray-100 pt-2">
            <button
              onClick={() => onViewHistory(producto)}
              className="flex-1 rounded-lg py-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-bakery-600"
              title="Ver historial de precios"
              aria-label={`Ver historial de precios de ${producto.nombre}`}
            >
              <svg className="mx-auto h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
            <button
              onClick={() => onEdit(producto)}
              className="flex-1 rounded-lg py-2 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
              title="Editar"
              aria-label={`Editar ${producto.nombre}`}
            >
              <svg className="mx-auto h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={() => onDelete(producto)}
              className="flex-1 rounded-lg py-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
              title="Eliminar"
              aria-label={`Eliminar ${producto.nombre}`}
            >
              <svg className="mx-auto h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
