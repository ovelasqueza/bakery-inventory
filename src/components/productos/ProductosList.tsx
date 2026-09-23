'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Input, LoadingSpinner, EmptyState, useToast } from '@/components/ui';
import { ProductoCard } from './ProductoCard';
import { ProductoForm } from './ProductoForm';
import { HistorialPreciosModal } from './HistorialPreciosModal';
import type { Producto } from '@/types/database';
import {
  getProductos,
  createProducto,
  updateProducto,
  deleteProducto,
} from '@/lib/api/productos';
import { debounce } from '@/lib/utils';

export function ProductosList() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [filteredProductos, setFilteredProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isHistorialOpen, setIsHistorialOpen] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    loadProductos();
  }, []);

  // Filtrar productos cuando cambia la búsqueda
  const filterProductos = useCallback(
    debounce((query: string) => {
      if (!query.trim()) {
        setFilteredProductos(productos);
      } else {
        const filtered = productos.filter(
          (p) => p.nombre.toLowerCase().includes(query.toLowerCase())
        );
        setFilteredProductos(filtered);
      }
    }, 300),
    [productos]
  );

  useEffect(() => {
    filterProductos(searchQuery);
  }, [searchQuery, filterProductos]);

  async function loadProductos() {
    try {
      setLoading(true);
      const data = await getProductos();
      setProductos(data);
      setFilteredProductos(data);
    } catch (error) {
      showToast('Error al cargar los productos', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const handleCreate = () => {
    setSelectedProducto(null);
    setIsFormOpen(true);
  };

  const handleEdit = (producto: Producto) => {
    setSelectedProducto(producto);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (producto: Producto) => {
    setSelectedProducto(producto);
    setIsDeleteOpen(true);
  };

  const handleViewHistory = (producto: Producto) => {
    setSelectedProducto(producto);
    setIsHistorialOpen(true);
  };

  const handleFormSubmit = async (data: {
    nombre: string;
    precio_actual: number;
    tipo_producto: 'normal' | 'produccion' | 'materia_prima';
    contenido_por_unidad?: number | null;
    unidad_medida?: string | null;
  }) => {
    setFormLoading(true);
    try {
      if (selectedProducto) {
        await updateProducto(selectedProducto.id, data);
        showToast('Producto actualizado correctamente', 'success');
      } else {
        await createProducto(data);
        showToast('Producto creado correctamente', 'success');
      }
      setIsFormOpen(false);
      loadProductos();
    } catch (error) {
      showToast(
        selectedProducto
          ? 'Error al actualizar el producto'
          : 'Error al crear el producto',
        'error'
      );
      console.error(error);
    } finally {
      setFormLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedProducto) return;

    setFormLoading(true);
    try {
      await deleteProducto(selectedProducto.id);
      showToast('Producto eliminado correctamente', 'success');
      setIsDeleteOpen(false);
      loadProductos();
    } catch (error) {
      showToast('Error al eliminar el producto', 'error');
      console.error(error);
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda y botón crear */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="Buscar producto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button onClick={handleCreate} className="whitespace-nowrap">
          <svg
            className="w-5 h-5 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="hidden sm:inline">Nuevo</span>
        </Button>
      </div>

      {/* Lista de productos agrupados por tipo */}
      {filteredProductos.length === 0 ? (
        <EmptyState
          title={searchQuery ? 'Sin resultados' : 'Sin productos'}
          description={
            searchQuery
              ? 'No se encontraron productos con ese término'
              : 'Comienza agregando tu primer producto'
          }
          actionLabel={searchQuery ? undefined : 'Agregar producto'}
          onAction={searchQuery ? undefined : handleCreate}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Productos Normales */}
          {filteredProductos.filter(p => p.tipo_producto === 'normal' || !p.tipo_producto).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-gray-200" />
                <h3 className="text-sm font-semibold text-gray-600 px-2 bg-gray-50 rounded-full">
                  📦 Productos Normales
                </h3>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProductos
                  .filter(p => p.tipo_producto === 'normal' || !p.tipo_producto)
                  .map((producto) => (
                    <ProductoCard
                      key={producto.id}
                      producto={producto}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      onViewHistory={handleViewHistory}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Productos de Producción */}
          {filteredProductos.filter(p => p.tipo_producto === 'produccion').length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-orange-200" />
                <h3 className="text-sm font-semibold text-orange-600 px-2 bg-orange-50 rounded-full">
                  🍞 Producción
                </h3>
                <div className="h-px flex-1 bg-orange-200" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProductos
                  .filter(p => p.tipo_producto === 'produccion')
                  .map((producto) => (
                    <ProductoCard
                      key={producto.id}
                      producto={producto}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      onViewHistory={handleViewHistory}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Materias Primas */}
          {filteredProductos.filter(p => p.tipo_producto === 'materia_prima').length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-yellow-200" />
                <h3 className="text-sm font-semibold text-yellow-700 px-2 bg-yellow-50 rounded-full">
                  🌾 Materias Primas
                </h3>
                <div className="h-px flex-1 bg-yellow-200" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProductos
                  .filter(p => p.tipo_producto === 'materia_prima')
                  .map((producto) => (
                    <ProductoCard
                      key={producto.id}
                      producto={producto}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      onViewHistory={handleViewHistory}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de formulario */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedProducto ? 'Editar producto' : 'Nuevo producto'}
      >
        <ProductoForm
          producto={selectedProducto}
          onSubmit={handleFormSubmit}
          onCancel={() => setIsFormOpen(false)}
          isLoading={formLoading}
        />
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Eliminar producto"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            ¿Estás seguro de que deseas eliminar{' '}
            <strong>{selectedProducto?.nombre}</strong>? Esta acción desactivará
            el producto del catálogo.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsDeleteOpen(false)}
              disabled={formLoading}
              fullWidth
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              isLoading={formLoading}
              fullWidth
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de historial de precios */}
      <HistorialPreciosModal
        producto={selectedProducto}
        isOpen={isHistorialOpen}
        onClose={() => setIsHistorialOpen(false)}
      />
    </div>
  );
}
