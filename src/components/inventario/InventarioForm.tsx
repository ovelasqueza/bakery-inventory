'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button, Input, Card, LoadingSpinner, EmptyState, Modal, useToast } from '@/components/ui';
import { InventarioProductoItem } from './InventarioProductoItem';
import { ProductoForm } from '../productos/ProductoForm';
import type { Inventario, ProductoInventario, InventarioFactura } from '@/types/database';
import {
  inicializarInventario,
  saveInventarioDetalles,
  finalizarInventario,
  getFacturasInventario,
  createFacturaInventario,
  deleteFacturaInventario,
} from '@/lib/api/inventarios';
import { createProducto } from '@/lib/api/productos';
import {
  formatCurrency,
  getDefaultInventoryDate,
  toISODateString,
  calculateTotal,
} from '@/lib/utils';

interface InventarioFormProps {
  onComplete?: () => void;
  fechaInicial?: string | null;
}

export function InventarioForm({ onComplete, fechaInicial }: InventarioFormProps) {
  const [fecha, setFecha] = useState(fechaInicial || toISODateString(getDefaultInventoryDate()));
  const [inventario, setInventario] = useState<Inventario | null>(null);
  const [productos, setProductos] = useState<ProductoInventario[]>([]);
  const [porcentajeProduccion, setPorcentajeProduccion] = useState(15);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [yaCargoInicial, setYaCargoInicial] = useState(false);
  const { showToast } = useToast();

  // Estado para facturas
  const [facturas, setFacturas] = useState<InventarioFactura[]>([]);
  const [nuevaFacturaNombre, setNuevaFacturaNombre] = useState('');
  const [nuevaFacturaValor, setNuevaFacturaValor] = useState('');
  const [agregandoFactura, setAgregandoFactura] = useState(false);

  // Estado para autoguardado
  const [autoGuardando, setAutoGuardando] = useState(false);
  const [ultimoGuardado, setUltimoGuardado] = useState<Date | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const productosIniciales = useRef<string>('');

  // Estado para modal de nuevo producto
  const [showNuevoProducto, setShowNuevoProducto] = useState(false);
  const [creandoProducto, setCreandoProducto] = useState(false);

  // Si hay fecha inicial, cargar automáticamente el inventario (solo una vez)
  useEffect(() => {
    if (fechaInicial && !yaCargoInicial) {
      setYaCargoInicial(true);
      cargarInventario(fechaInicial, false);
    }
  }, [fechaInicial, yaCargoInicial]);

  // Autoguardado con debounce de 3 segundos
  useEffect(() => {
    if (!inventario || inventario.estado === 'completado') return;
    
    // Serializar productos actuales para comparar
    const productosActuales = JSON.stringify(productos.map(p => ({ id: p.producto_id, c: p.cantidad, s: p.subtotal })));
    
    // Si es la primera carga, guardar el estado inicial sin disparar guardado
    if (!productosIniciales.current) {
      productosIniciales.current = productosActuales;
      return;
    }
    
    // Si no hay cambios, no hacer nada
    if (productosActuales === productosIniciales.current) return;
    
    // Limpiar timer anterior
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Crear nuevo timer para guardar en 3 segundos
    debounceTimerRef.current = setTimeout(async () => {
      setAutoGuardando(true);
      try {
        await saveInventarioDetalles(
          inventario.id,
          productos.map((p) => ({
            producto_id: p.producto_id,
            cantidad: p.cantidad,
            precio_unitario_aplicado: p.precio_unitario,
            subtotal: p.subtotal,
          }))
        );
        productosIniciales.current = productosActuales;
        setUltimoGuardado(new Date());
      } catch (error) {
        console.error('Error en autoguardado:', error);
      } finally {
        setAutoGuardando(false);
      }
    }, 3000);
    
    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [productos, inventario]);

  const cargarInventario = async (fechaParam: string, mostrarToast: boolean = true) => {
    setLoading(true);
    try {
      const resultado = await inicializarInventario(fechaParam);
      setInventario(resultado.inventario);
      setProductos(resultado.productos);
      setPorcentajeProduccion(resultado.porcentajeProduccion);
      
      // Cargar facturas existentes
      const facturasExistentes = await getFacturasInventario(resultado.inventario.id);
      setFacturas(facturasExistentes);
      
      if (mostrarToast) {
        if (resultado.inventario.estado === 'en_proceso') {
          showToast(
            resultado.productos.some((p) => p.cantidad > 0)
              ? 'Inventario cargado'
              : 'Nuevo inventario iniciado',
            'success'
          );
        } else {
          showToast('Este inventario ya está finalizado', 'info');
        }
      }
    } catch (error) {
      console.error('Error al cargar inventario:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al cargar el inventario';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar productos por búsqueda
  const filteredProductos = useMemo(() => {
    if (!searchQuery.trim()) return productos;
    const query = searchQuery.toLowerCase();
    return productos.filter(
      (p) => p.nombre.toLowerCase().includes(query)
    );
  }, [productos, searchQuery]);

  // Agrupar por tipo y ordenar: sin contar arriba, contados abajo
  const productosPorGrupo = useMemo(() => {
    const grupos = new Map<string, ProductoInventario[]>();
    
    // Primero agrupar por tipo, luego por categoría
    const ordenTipos = ['normal', 'produccion', 'materia_prima'];
    const nombresTipos: Record<string, string> = {
      normal: '📦 Productos Normales',
      produccion: '🥖 Productos de Producción',
      materia_prima: '🌾 Materias Primas',
    };
    
    ordenTipos.forEach(tipo => {
      const productosTipo = filteredProductos.filter(p => p.tipo_producto === tipo);
      if (productosTipo.length > 0) {
        // Ordenar: sin contar (cantidad = 0) arriba, contados (cantidad > 0) abajo
        const ordenados = [...productosTipo].sort((a, b) => {
          const aContado = a.cantidad > 0 || a.subtotal > 0 ? 1 : 0;
          const bContado = b.cantidad > 0 || b.subtotal > 0 ? 1 : 0;
          if (aContado !== bContado) {
            return aContado - bContado; // Sin contar primero
          }
          // Si ambos tienen el mismo estado, ordenar alfabéticamente
          return a.nombre.localeCompare(b.nombre);
        });
        grupos.set(nombresTipos[tipo], ordenados);
      }
    });

    return grupos;
  }, [filteredProductos]);

  // Calcular total general (productos + facturas)
  const totalProductos = useMemo(() => {
    return calculateTotal(productos);
  }, [productos]);

  const totalFacturas = useMemo(() => {
    return facturas.reduce((sum, f) => sum + f.valor, 0);
  }, [facturas]);

  const totalGeneral = totalProductos + totalFacturas;

  // Productos con cantidad > 0
  const productosContados = useMemo(() => {
    return productos.filter((p) => p.cantidad > 0 || p.subtotal > 0).length;
  }, [productos]);

  const handleIniciarInventario = async () => {
    await cargarInventario(fecha, true);
  };

  const handleCantidadChange = useCallback((productoId: string, cantidad: number, subtotal: number) => {
    setProductos((prev) =>
      prev.map((p) => {
        if (p.producto_id === productoId) {
          return { ...p, cantidad, subtotal };
        }
        return p;
      })
    );
  }, []);

  // Abrir modal de nuevo producto (guarda primero)
  const handleAbrirNuevoProducto = async () => {
    if (!inventario) return;
    
    // Guardar inventario actual antes de abrir modal
    try {
      await saveInventarioDetalles(
        inventario.id,
        productos.map((p) => ({
          producto_id: p.producto_id,
          cantidad: p.cantidad,
          precio_unitario_aplicado: p.precio_unitario,
          subtotal: p.subtotal,
        }))
      );
      productosIniciales.current = JSON.stringify(productos.map(p => ({ id: p.producto_id, c: p.cantidad, s: p.subtotal })));
      setUltimoGuardado(new Date());
    } catch (error) {
      console.error('Error al guardar antes de crear producto:', error);
    }
    
    setShowNuevoProducto(true);
  };

  // Crear nuevo producto desde inventario
  const handleCrearProducto = async (data: {
    nombre: string;
    precio_actual: number;
    tipo_producto: 'normal' | 'produccion' | 'materia_prima';
    contenido_por_unidad?: number | null;
    unidad_medida?: string | null;
  }) => {
    setCreandoProducto(true);
    try {
      const nuevoProducto = await createProducto(data);
      
      // Agregar el nuevo producto a la lista del inventario
      const nuevoProductoInventario: ProductoInventario = {
        producto_id: nuevoProducto.id,
        nombre: nuevoProducto.nombre,
        tipo_producto: nuevoProducto.tipo_producto || 'normal',
        precio_unitario: nuevoProducto.precio_actual,
        contenido_por_unidad: nuevoProducto.contenido_por_unidad,
        unidad_medida: nuevoProducto.unidad_medida,
        cantidad: 0,
        subtotal: 0,
      };
      
      setProductos(prev => [...prev, nuevoProductoInventario]);
      setShowNuevoProducto(false);
      showToast(`Producto "${nuevoProducto.nombre}" creado`, 'success');
      
      // Actualizar el estado inicial para que no dispare autoguardado innecesario
      setTimeout(() => {
        productosIniciales.current = JSON.stringify([...productos, nuevoProductoInventario].map(p => ({ id: p.producto_id, c: p.cantidad, s: p.subtotal })));
      }, 100);
      
    } catch (error) {
      console.error('Error al crear producto:', error);
      showToast('Error al crear el producto', 'error');
    } finally {
      setCreandoProducto(false);
    }
  };

  // Agregar factura
  const handleAgregarFactura = async () => {
    if (!inventario || !nuevaFacturaNombre.trim() || !nuevaFacturaValor) return;
    
    const valor = parseFloat(nuevaFacturaValor);
    if (isNaN(valor) || valor <= 0) {
      showToast('Ingresa un valor válido', 'error');
      return;
    }

    setAgregandoFactura(true);
    try {
      const nuevaFactura = await createFacturaInventario({
        inventario_id: inventario.id,
        nombre: nuevaFacturaNombre.trim(),
        valor: valor,
      });
      
      setFacturas(prev => [...prev, nuevaFactura]);
      setNuevaFacturaNombre('');
      setNuevaFacturaValor('');
      showToast('Factura agregada', 'success');
    } catch (error) {
      console.error('Error al agregar factura:', error);
      showToast('Error al agregar factura', 'error');
    } finally {
      setAgregandoFactura(false);
    }
  };

  // Eliminar factura
  const handleEliminarFactura = async (facturaId: string) => {
    try {
      await deleteFacturaInventario(facturaId);
      setFacturas(prev => prev.filter(f => f.id !== facturaId));
      showToast('Factura eliminada', 'success');
    } catch (error) {
      console.error('Error al eliminar factura:', error);
      showToast('Error al eliminar factura', 'error');
    }
  };

  const handleGuardar = async (finalizar = false) => {
    if (!inventario) return;

    setSaving(true);
    try {
      // Guardar detalles con el subtotal ya calculado (incluye descuentos)
      await saveInventarioDetalles(
        inventario.id,
        productos.map((p) => ({
          producto_id: p.producto_id,
          cantidad: p.cantidad,
          precio_unitario_aplicado: p.precio_unitario,
          subtotal: p.subtotal, // Subtotal ya incluye el descuento calculado
        }))
      );

      if (finalizar) {
        await finalizarInventario(inventario.id);
        showToast('Inventario finalizado correctamente', 'success');
        onComplete?.();
      } else {
        showToast('Inventario guardado', 'success');
      }
    } catch (error) {
      console.error('Error al guardar inventario:', error);
      showToast('Error al guardar el inventario', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Si no hay inventario iniciado, mostrar selector de fecha
  if (!inventario) {
    return (
      <Card className="max-w-md mx-auto">
        <div className="p-6 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-bakery-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-bakery-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Iniciar Inventario
            </h2>
          </div>

          <Input
            label="Fecha del inventario"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />

          <Button
            onClick={handleIniciarInventario}
            isLoading={loading}
            fullWidth
            size="lg"
          >
            Iniciar
          </Button>
        </div>
      </Card>
    );
  }

  // Vista principal del inventario
  return (
    <div className="space-y-4 pb-32">
      {/* Header con información del inventario */}
      <Card>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-900">
                Inventario del{' '}
                {new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </h2>
              <p className="text-sm text-gray-500">
                {productosContados} de {productos.length} productos contados
              </p>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                inventario.estado === 'completado'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {inventario.estado === 'completado' ? 'Finalizado' : 'En proceso'}
            </span>
          </div>

          {/* Barra de búsqueda y botón nuevo producto */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Buscar producto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {inventario.estado !== 'completado' && (
              <Button
                variant="secondary"
                onClick={handleAbrirNuevoProducto}
                className="whitespace-nowrap"
              >
                <svg className="w-5 h-5 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Nuevo</span>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Lista de productos */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredProductos.length === 0 ? (
        <EmptyState
          title={searchQuery ? 'Sin resultados' : 'Sin productos'}
          description={
            searchQuery
              ? 'No se encontraron productos con ese término'
              : 'Agrega productos al catálogo para poder realizar el inventario'
          }
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
          {Array.from(productosPorGrupo.entries()).map(([grupo, items]) => (
            <div key={grupo}>
              <h3 className="text-sm font-medium text-gray-700 mb-2 px-1">
                {grupo}
              </h3>
              <div className="space-y-2">
                {items.map((producto) => (
                  <InventarioProductoItem
                    key={producto.producto_id}
                    producto={producto}
                    porcentajeProduccion={porcentajeProduccion}
                    onCantidadChange={handleCantidadChange}
                    disabled={inventario.estado === 'completado'}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sección de Facturas */}
      <Card>
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-bakery-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Facturas adicionales
          </h3>

          {/* Lista de facturas existentes */}
          {facturas.length > 0 && (
            <div className="space-y-2 mb-4">
              {facturas.map((factura) => (
                <div
                  key={factura.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{factura.nombre}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-bakery-600">
                      {formatCurrency(factura.valor)}
                    </span>
                    {inventario.estado !== 'completado' && (
                      <button
                        type="button"
                        onClick={() => handleEliminarFactura(factura.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Eliminar factura"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Subtotal de facturas */}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-sm text-gray-500">Subtotal facturas</span>
                <span className="font-semibold text-bakery-600">{formatCurrency(totalFacturas)}</span>
              </div>
            </div>
          )}

          {/* Formulario para agregar factura */}
          {inventario.estado !== 'completado' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Nombre de la factura"
                    value={nuevaFacturaNombre}
                    onChange={(e) => setNuevaFacturaNombre(e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-32">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="Valor"
                    value={nuevaFacturaValor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0)) {
                        setNuevaFacturaValor(v);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAgregarFactura();
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={handleAgregarFactura}
                  isLoading={agregandoFactura}
                  disabled={!nuevaFacturaNombre.trim() || !nuevaFacturaValor}
                  className="w-full sm:w-auto"
                >
                  <svg className="w-5 h-5 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">Agregar</span>
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Las facturas se agregan al total del inventario
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Barra fija inferior con total y acciones */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-500">Total del inventario</p>
                {/* Indicador de autoguardado */}
                {autoGuardando && (
                  <span className="flex items-center gap-1 text-xs text-blue-500">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Guardando...
                  </span>
                )}
                {!autoGuardando && ultimoGuardado && (
                  <span className="text-xs text-green-500">✓ Guardado</span>
                )}
              </div>
              <p className="text-2xl font-bold text-bakery-600">
                {formatCurrency(totalGeneral)}
              </p>
              {facturas.length > 0 && (
                <p className="text-xs text-gray-400">
                  Productos: {formatCurrency(totalProductos)} + Facturas: {formatCurrency(totalFacturas)}
                </p>
              )}
            </div>
            {inventario.estado !== 'completado' && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleGuardar(false)}
                  isLoading={saving}
                  size="lg"
                >
                  Guardar
                </Button>
                <Button
                  onClick={() => handleGuardar(true)}
                  isLoading={saving}
                  size="lg"
                >
                  Finalizar
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal para crear nuevo producto */}
      <Modal
        isOpen={showNuevoProducto}
        onClose={() => setShowNuevoProducto(false)}
        title="Nuevo producto"
      >
        <ProductoForm
          onSubmit={handleCrearProducto}
          onCancel={() => setShowNuevoProducto(false)}
          isLoading={creandoProducto}
        />
      </Modal>
    </div>
  );
}
