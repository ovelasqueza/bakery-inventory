'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, LoadingSpinner, EmptyState, Modal, useToast } from '@/components/ui';
import { InventarioForm } from '@/components/inventario';
import type { Inventario, InventarioCompleto } from '@/types/database';
import { getInventarios, deleteInventario, getInventarioById, reabrirInventario } from '@/lib/api/inventarios';
import { formatCurrency } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type View = 'list' | 'new' | 'edit';

export default function InventarioPage() {
  const [view, setView] = useState<View>('list');
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFecha, setSelectedFecha] = useState<string | null>(null);
  const [detalleInventario, setDetalleInventario] = useState<InventarioCompleto | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (view === 'list') {
      loadInventarios();
    }
  }, [view]);

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

  const handleContinuarInventario = (fecha: string) => {
    setSelectedFecha(fecha);
    setView('edit');
  };

  const handleNuevoInventario = () => {
    setSelectedFecha(null);
    setView('new');
  };

  const handleBack = () => {
    setView('list');
    setSelectedFecha(null);
  };

  const handleVerDetalle = async (id: string) => {
    setLoadingDetalle(true);
    setShowDetalle(true);
    try {
      const data = await getInventarioById(id);
      setDetalleInventario(data);
    } catch (error) {
      showToast('Error al cargar el detalle', 'error');
      console.error(error);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const handleDeleteInventario = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const formatFechaInventario = (fecha: string) => {
    const date = new Date(fecha + 'T12:00:00');
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatFechaCorta = (fecha: string) => {
    const date = new Date(fecha + 'T12:00:00');
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const exportarPDF = () => {
    if (!detalleInventario) return;

    const doc = new jsPDF();
    const fechaFormateada = formatFechaCorta(detalleInventario.fecha_inventario);
    
    // Título
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Inventario Panadería', 14, 20);
    
    // Fecha
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${formatFechaInventario(detalleInventario.fecha_inventario)}`, 14, 30);
    
    // Tabla de productos
    const detalles = detalleInventario.inventario_detalles || [];
    const tableData = detalles.map((d) => [
      d.productos?.nombre || 'Producto',
      d.cantidad.toString(),
      formatCurrency(d.precio_unitario_aplicado),
      formatCurrency(d.subtotal),
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Producto', 'Cantidad', 'Precio Unit.', 'Subtotal']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [237, 117, 26], // Color bakery
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 35, halign: 'right' },
      },
      foot: [[
        { content: 'TOTAL GENERAL', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: formatCurrency(detalleInventario.total_general), styles: { fontStyle: 'bold', halign: 'right' } },
      ]],
    });

    // Guardar
    doc.save(`inventario_${fechaFormateada.replace(/\//g, '-')}.pdf`);
    showToast('PDF exportado correctamente', 'success');
  };

  // Separar inventarios en curso y completados
  const inventariosEnCurso = inventarios.filter((i) => i.estado === 'en_proceso');
  const inventariosCompletados = inventarios.filter((i) => i.estado === 'completado');

  if (view !== 'list') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 -ml-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Volver"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {view === 'new' ? 'Nuevo Inventario' : 'Continuar Inventario'}
                </h1>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">
          <InventarioForm 
            onComplete={handleBack} 
            fechaInicial={selectedFecha}
          />
        </main>
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
              aria-label="Volver al inicio"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Inventarios</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <>
            {/* Inventarios en curso */}
            {inventariosEnCurso.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                  Inventarios en curso
                </h2>
                <div className="space-y-3">
                  {inventariosEnCurso.map((inventario) => (
                    <Card
                      key={inventario.id}
                      className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-yellow-500"
                      onClick={() => handleContinuarInventario(inventario.fecha_inventario)}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">
                              {formatFechaInventario(inventario.fecha_inventario)}
                            </h3>
                            <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                              En proceso
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-bakery-600">
                              {formatCurrency(inventario.total_general)}
                            </p>
                            <p className="text-xs text-gray-500">Total parcial</p>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => handleDeleteInventario(inventario.id, e)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            Eliminar
                          </Button>
                          <Button size="sm" variant="primary">
                            Continuar
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Botón nuevo inventario */}
            <section>
              <Card 
                className="cursor-pointer hover:shadow-md transition-shadow border-2 border-dashed border-bakery-300 bg-bakery-50/50"
                onClick={handleNuevoInventario}
              >
                <div className="p-6 flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-bakery-100 rounded-full flex items-center justify-center mb-3">
                    <svg
                      className="w-6 h-6 text-bakery-600"
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
                  </div>
                  <h3 className="font-medium text-bakery-700">Nuevo Inventario</h3>
                </div>
              </Card>
            </section>

            {/* Inventarios completados */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Inventarios realizados
              </h2>
              {inventariosCompletados.length === 0 ? (
                <EmptyState
                  title="Sin inventarios completados"
                  description="Los inventarios finalizados aparecerán aquí"
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
              ) : (
                <div className="space-y-3">
                  {inventariosCompletados.map((inventario) => (
                    <Card
                      key={inventario.id}
                      className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500"
                      onClick={() => handleVerDetalle(inventario.id)}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">
                              {formatFechaInventario(inventario.fecha_inventario)}
                            </h3>
                            <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                              Completado
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-600">
                              {formatCurrency(inventario.total_general)}
                            </p>
                            <p className="text-xs text-gray-500">Ver detalle →</p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Modal de detalle del inventario */}
      <Modal
        isOpen={showDetalle}
        onClose={() => {
          setShowDetalle(false);
          setDetalleInventario(null);
        }}
        title={detalleInventario ? `Inventario - ${formatFechaInventario(detalleInventario.fecha_inventario)}` : 'Detalle del inventario'}
        size="lg"
      >
        {loadingDetalle ? (
          <div className="py-8">
            <LoadingSpinner size="lg" />
          </div>
        ) : detalleInventario ? (
          <div className="space-y-4">
            {/* Resumen con botón editar sutil */}
            <div className="bg-green-50 rounded-lg p-4 relative">
              <button
                onClick={async () => {
                  try {
                    // Reabrir el inventario para permitir edición
                    await reabrirInventario(detalleInventario.id);
                    setShowDetalle(false);
                    setSelectedFecha(detalleInventario.fecha_inventario);
                    setDetalleInventario(null);
                    setView('edit');
                  } catch (error) {
                    showToast('Error al reabrir el inventario', 'error');
                    console.error(error);
                  }
                }}
                className="absolute top-2 right-2 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                title="Editar inventario"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Editar
              </button>
              <p className="text-sm text-green-700">Total del inventario</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(detalleInventario.total_general)}
              </p>
            </div>

            {/* Lista de productos */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b hidden sm:block">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase">
                  <div className="col-span-5">Producto</div>
                  <div className="col-span-2 text-center">Cant.</div>
                  <div className="col-span-2 text-right">Precio</div>
                  <div className="col-span-3 text-right">Subtotal</div>
                </div>
              </div>
              <div className="divide-y max-h-[50vh] overflow-y-auto">
                {detalleInventario.inventario_detalles && detalleInventario.inventario_detalles.length > 0 ? (
                  detalleInventario.inventario_detalles.map((detalle) => {
                    // Detectar si tiene descuento comparando subtotal con cantidad*precio
                    const subtotalSinDescuento = detalle.cantidad * detalle.precio_unitario_aplicado;
                    const tieneDescuento = Math.abs(subtotalSinDescuento - detalle.subtotal) > 0.01;
                    
                    return (
                      <div key={detalle.id} className="px-4 py-3">
                        {/* Vista móvil */}
                        <div className="sm:hidden">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900 text-sm">
                                {detalle.productos?.nombre || 'Producto'}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {detalle.cantidad} × {formatCurrency(detalle.precio_unitario_aplicado)}
                                {tieneDescuento && (
                                  <span className="ml-1 text-orange-600">(con dcto)</span>
                                )}
                              </p>
                            </div>
                            <p className={`font-semibold ml-4 ${tieneDescuento ? 'text-orange-600' : 'text-gray-900'}`}>
                              {formatCurrency(detalle.subtotal)}
                            </p>
                          </div>
                        </div>
                        {/* Vista desktop */}
                        <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <p className="font-medium text-gray-900 text-sm truncate">
                              {detalle.productos?.nombre || 'Producto'}
                              {tieneDescuento && (
                                <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Dcto</span>
                              )}
                            </p>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 bg-gray-100 rounded text-sm font-medium">
                              {detalle.cantidad}
                            </span>
                          </div>
                          <div className="col-span-2 text-right text-sm text-gray-600">
                            {formatCurrency(detalle.precio_unitario_aplicado)}
                          </div>
                          <div className={`col-span-3 text-right font-medium ${tieneDescuento ? 'text-orange-600' : 'text-gray-900'}`}>
                            {formatCurrency(detalle.subtotal)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-4 py-8 text-center text-gray-500">
                    No hay productos en este inventario
                  </div>
                )}
              </div>
            </div>

            {/* Total final y botón PDF */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t">
              <div>
                <span className="text-sm text-gray-500">Total General</span>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(detalleInventario.total_general)}
                </p>
              </div>
              <Button onClick={exportarPDF} variant="primary" fullWidth className="sm:w-auto">
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Exportar PDF
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-center text-gray-500 py-8">No se pudo cargar el detalle</p>
        )}
      </Modal>
    </div>
  );
}
