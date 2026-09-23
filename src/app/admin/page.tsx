'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, Input, LoadingSpinner, Modal, useToast } from '@/components/ui';
import type { Inventario, Configuracion } from '@/types/database';
import { getInventarios, deleteInventario } from '@/lib/api/inventarios';
import { getConfiguraciones, updateConfiguracion } from '@/lib/api/configuracion';
import { formatCurrency } from '@/lib/utils';

export default function AdminPage() {
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [configuraciones, setConfiguraciones] = useState<Configuracion[]>([]);
  const [loading, setLoading] = useState(true);
  const [porcentaje, setPorcentaje] = useState('15');
  const [savingConfig, setSavingConfig] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [inventarioToDelete, setInventarioToDelete] = useState<Inventario | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  const { showToast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invData, configData] = await Promise.all([
        getInventarios(),
        getConfiguraciones(),
      ]);
      setInventarios(invData);
      setConfiguraciones(configData);
      
      // Cargar el porcentaje actual
      const porcentajeConfig = configData.find(c => c.clave === 'porcentaje_descuento_produccion');
      if (porcentajeConfig) {
        setPorcentaje(porcentajeConfig.valor);
      }
    } catch (error) {
      showToast('Error al cargar datos', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const success = await updateConfiguracion('porcentaje_descuento_produccion', porcentaje);
      if (success) {
        showToast('Configuración guardada', 'success');
      } else {
        showToast('Error al guardar', 'error');
      }
    } catch (error) {
      showToast('Error al guardar', 'error');
      console.error(error);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDeleteClick = (inventario: Inventario) => {
    setInventarioToDelete(inventario);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!inventarioToDelete) return;
    
    setDeleting(true);
    try {
      await deleteInventario(inventarioToDelete.id);
      showToast('Inventario eliminado', 'success');
      setShowDeleteModal(false);
      setInventarioToDelete(null);
      loadData();
    } catch (error) {
      showToast('Error al eliminar', 'error');
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  const formatFecha = (fecha: string) => {
    const date = new Date(fecha + 'T12:00:00');
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'completado':
        return <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">Completado</span>;
      case 'en_proceso':
        return <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">En proceso</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">{estado}</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Administración</h1>
              <p className="text-sm text-gray-500">Configuración del sistema</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Configuración de porcentaje */}
        <Card>
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              ⚙️ Configuración de Producción
            </h2>
            <div className="flex gap-4 items-end">
              <div className="flex-1 max-w-xs">
                <Input
                  label="Porcentaje de descuento (%)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={porcentaje}
                  onChange={(e) => setPorcentaje(e.target.value)}
                  helperText="Se aplica a productos de producción"
                />
              </div>
              <Button onClick={handleSaveConfig} isLoading={savingConfig}>
                Guardar
              </Button>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Ejemplo:</strong> Pan a $2,000 con {porcentaje}% descuento = {formatCurrency(2000 * (100 - parseFloat(porcentaje || '0')) / 100)}
              </p>
            </div>
          </div>
        </Card>

        {/* Lista de inventarios para eliminar */}
        <Card>
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              📋 Gestión de Inventarios
            </h2>
            {inventarios.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No hay inventarios registrados</p>
            ) : (
              <div className="space-y-2">
                {inventarios.map((inventario) => (
                  <div
                    key={inventario.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {formatFecha(inventario.fecha_inventario)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {getEstadoBadge(inventario.estado)}
                        <span className="text-sm text-gray-500">
                          {formatCurrency(inventario.total_general)}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteClick(inventario)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </main>

      {/* Modal de confirmación eliminar inventario */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar inventario"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            ¿Estás seguro de eliminar el inventario del{' '}
            <strong>{inventarioToDelete && formatFecha(inventarioToDelete.fecha_inventario)}</strong>?
          </p>
          <p className="text-sm text-red-600">
            Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
              fullWidth
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              isLoading={deleting}
              fullWidth
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
