'use client';

import { Card } from '@/components/ui';
import type { Producto } from '@/types/database';
import { formatCurrency } from '@/lib/utils';

interface ProductoCardProps {
  producto: Producto;
  onEdit: (producto: Producto) => void;
  onDelete: (producto: Producto) => void;
  onViewHistory: (producto: Producto) => void;
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
}: ProductoCardProps) {
  const tipo = producto.tipo_producto || 'normal';
  const tipoInfo = tipoLabels[tipo] || tipoLabels.normal;

  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate">
              {producto.nombre}
            </h3>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${tipoInfo.color}`}>
                {tipoInfo.label}
              </span>
            </div>
          </div>
          <div className="text-right">
            {tipo !== 'materia_prima' ? (
              <p className="text-lg font-bold text-bakery-600">
                {formatCurrency(producto.precio_actual)}
              </p>
            ) : (
              <div>
                <p className="text-lg font-bold text-yellow-600">
                  {formatCurrency(producto.precio_actual)}
                </p>
                <p className="text-xs text-gray-500">
                  /{producto.contenido_por_unidad} {producto.unidad_medida}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
          <button
            onClick={() => onViewHistory(producto)}
            className="flex-1 py-2 text-sm text-gray-600 hover:text-bakery-600 hover:bg-gray-50 rounded-lg transition-colors"
            title="Ver historial de precios"
          >
            <svg
              className="w-4 h-4 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
            className="flex-1 py-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Editar"
          >
            <svg
              className="w-4 h-4 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
            className="flex-1 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Eliminar"
          >
            <svg
              className="w-4 h-4 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
    </Card>
  );
}
