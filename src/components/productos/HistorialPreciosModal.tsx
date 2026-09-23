'use client';

import { useState, useEffect } from 'react';
import { Modal, LoadingSpinner, EmptyState } from '@/components/ui';
import type { Producto, HistorialPrecio } from '@/types/database';
import { getHistorialPrecios } from '@/lib/api/productos';
import { formatCurrency, formatDate } from '@/lib/utils';

interface HistorialPreciosModalProps {
  producto: Producto | null;
  isOpen: boolean;
  onClose: () => void;
}

export function HistorialPreciosModal({
  producto,
  isOpen,
  onClose,
}: HistorialPreciosModalProps) {
  const [historial, setHistorial] = useState<HistorialPrecio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && producto) {
      loadHistorial();
    }
  }, [isOpen, producto]);

  async function loadHistorial() {
    if (!producto) return;

    setLoading(true);
    setError(null);

    try {
      const data = await getHistorialPrecios(producto.id);
      setHistorial(data);
    } catch (err) {
      setError('Error al cargar el historial');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (!producto) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Historial de precios - ${producto.nombre}`}
      size="md"
    >
      {loading ? (
        <div className="py-8">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <div className="py-8 text-center text-red-600">{error}</div>
      ) : historial.length === 0 ? (
        <EmptyState
          title="Sin historial"
          description="No hay cambios de precio registrados para este producto"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      ) : (
        <div className="divide-y divide-gray-100">
          {historial.map((item, index) => (
            <div key={item.id} className="py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  {formatDate(item.fecha_cambio)}
                </p>
                {index === 0 && (
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                    Precio actual
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900">
                  {formatCurrency(item.precio_nuevo)}
                </p>
                {item.precio_anterior !== null && (
                  <p className="text-sm text-gray-400 line-through">
                    {formatCurrency(item.precio_anterior)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
