'use client';

import { useState, useEffect } from 'react';
import { Card, Button, LoadingSpinner, EmptyState, useToast } from '@/components/ui';
import type { Inventario } from '@/types/database';
import { getInventarios, deleteInventario } from '@/lib/api/inventarios';
import { formatCurrency, formatDate } from '@/lib/utils';

interface InventariosListProps {
  onSelectInventario?: (id: string) => void;
  onNuevoInventario?: () => void;
}

export function InventariosList({
  onSelectInventario,
  onNuevoInventario,
}: InventariosListProps) {
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    loadInventarios();
  }, []);

  async function loadInventarios() {
    try {
      setLoading(true);
      const data = await getInventarios();
      setInventarios(data);
    } catch (error) {
      showToast('Error al cargar los inventarios', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este inventario?')) return;

    try {
      await deleteInventario(id);
      showToast('Inventario eliminado', 'success');
      loadInventarios();
    } catch (error) {
      showToast('Error al eliminar el inventario', 'error');
      console.error(error);
    }
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'completado':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
            Completado
          </span>
        );
      case 'en_proceso':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
            En proceso
          </span>
        );
      case 'cancelado':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
            Cancelado
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (inventarios.length === 0) {
    return (
      <EmptyState
        title="Sin inventarios"
        description="Comienza creando tu primer inventario"
        actionLabel="Nuevo inventario"
        onAction={onNuevoInventario}
        icon={
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {inventarios.map((inventario) => (
        <Card
          key={inventario.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onSelectInventario?.(inventario.id)}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">
                  {formatDate(inventario.fecha_inventario)}
                </h3>
                <div className="mt-1 flex items-center gap-2">
                  {getEstadoBadge(inventario.estado)}
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-bakery-600">
                  {formatCurrency(inventario.total_general)}
                </p>
              </div>
            </div>

            {inventario.estado !== 'completado' && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(inventario.id);
                  }}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Eliminar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectInventario?.(inventario.id);
                  }}
                >
                  Continuar
                </Button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
