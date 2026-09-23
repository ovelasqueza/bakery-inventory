'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Card } from '@/components/ui';
import type { ProductoInventario } from '@/types/database';
import { formatCurrency } from '@/lib/utils';

interface InventarioProductoItemProps {
  producto: ProductoInventario;
  porcentajeProduccion: number;
  onCantidadChange: (productoId: string, cantidad: number, subtotal: number) => void;
  disabled?: boolean;
}

export function InventarioProductoItem({
  producto,
  porcentajeProduccion,
  onCantidadChange,
  disabled = false,
}: InventarioProductoItemProps) {
  const [cantidad, setCantidad] = useState(producto.cantidad.toString());
  
  // Para materia prima: unidades completas y cantidad parcial
  const [unidadesCompletas, setUnidadesCompletas] = useState('0');
  const [cantidadParcial, setCantidadParcial] = useState('0');
  
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const esMateriaPrima = producto.tipo_producto === 'materia_prima';
  const esProduccion = producto.tipo_producto === 'produccion';
  
  // Datos de materia prima desde el producto
  const contenidoPorUnidad = producto.contenido_por_unidad || 1;
  const unidadMedida = producto.unidad_medida || 'unidades';

  // Calcular subtotal para materia prima basado en unidades + parcial
  const calcularSubtotalMateriaPrima = useCallback((unidades: number, parcial: number): number => {
    const precioUnidad = producto.precio_unitario; // precio por unidad completa (bulto, kilo)
    
    // Total = (unidades completas × precio) + (parcial/contenido × precio)
    const valorUnidadesCompletas = unidades * precioUnidad;
    const valorParcial = contenidoPorUnidad > 0 ? (parcial / contenidoPorUnidad) * precioUnidad : 0;
    
    return Math.round((valorUnidadesCompletas + valorParcial) * 100) / 100;
  }, [producto.precio_unitario, contenidoPorUnidad]);

  // Calcular subtotal según tipo de producto
  const calcularSubtotal = useCallback((cant: number): number => {
    let subtotal = cant * producto.precio_unitario;
    
    if (esProduccion) {
      // Aplicar descuento de producción
      subtotal = subtotal * (1 - porcentajeProduccion / 100);
    }
    
    return Math.round(subtotal * 100) / 100;
  }, [esProduccion, producto.precio_unitario, porcentajeProduccion]);

  // Sincronizar con props al inicio
  useEffect(() => {
    if (!isFocused) {
      if (esMateriaPrima) {
        // Intentar recuperar unidades y parcial de la cantidad total
        const cantidadTotal = producto.cantidad || 0;
        const unidadesEnteras = Math.floor(cantidadTotal);
        const fraccion = cantidadTotal - unidadesEnteras;
        const parcialRecuperado = Math.round(fraccion * contenidoPorUnidad * 100) / 100;
        
        setUnidadesCompletas(unidadesEnteras.toString());
        setCantidadParcial(parcialRecuperado > 0 ? parcialRecuperado.toString() : '0');
      } else {
        setCantidad(producto.cantidad.toString());
      }
    }
  }, [producto.cantidad, isFocused, esMateriaPrima, contenidoPorUnidad]);

  const handleCantidadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0)) {
      setCantidad(value);
    }
  };

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    
    if (esMateriaPrima) {
      const unidades = parseFloat(unidadesCompletas) || 0;
      const parcial = parseFloat(cantidadParcial) || 0;
      const subtotal = calcularSubtotalMateriaPrima(unidades, parcial);
      // Guardar cantidad total equivalente (para referencia)
      const cantidadTotal = unidades + (contenidoPorUnidad > 0 ? parcial / contenidoPorUnidad : 0);
      onCantidadChange(producto.producto_id, cantidadTotal, subtotal);
    } else {
      const num = parseFloat(cantidad) || 0;
      const roundedNum = Math.round(num * 100) / 100;
      setCantidad(roundedNum.toString());
      const subtotal = calcularSubtotal(roundedNum);
      onCantidadChange(producto.producto_id, roundedNum, subtotal);
    }
  }, [cantidad, unidadesCompletas, cantidadParcial, producto.producto_id, onCantidadChange, esMateriaPrima, calcularSubtotal, calcularSubtotalMateriaPrima, contenidoPorUnidad]);

  const handleFocus = () => {
    setIsFocused(true);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  const incrementar = () => {
    if (esMateriaPrima) {
      const num = (parseFloat(unidadesCompletas) || 0) + 1;
      setUnidadesCompletas(num.toString());
      const parcial = parseFloat(cantidadParcial) || 0;
      const subtotal = calcularSubtotalMateriaPrima(num, parcial);
      const cantidadTotal = num + (contenidoPorUnidad > 0 ? parcial / contenidoPorUnidad : 0);
      onCantidadChange(producto.producto_id, cantidadTotal, subtotal);
      return;
    }
    const num = (parseFloat(cantidad) || 0) + 1;
    setCantidad(num.toString());
    const subtotal = calcularSubtotal(num);
    onCantidadChange(producto.producto_id, num, subtotal);
  };

  const decrementar = () => {
    if (esMateriaPrima) {
      const num = Math.max((parseFloat(unidadesCompletas) || 0) - 1, 0);
      setUnidadesCompletas(num.toString());
      const parcial = parseFloat(cantidadParcial) || 0;
      const subtotal = calcularSubtotalMateriaPrima(num, parcial);
      const cantidadTotal = num + (contenidoPorUnidad > 0 ? parcial / contenidoPorUnidad : 0);
      onCantidadChange(producto.producto_id, cantidadTotal, subtotal);
      return;
    }
    const num = Math.max((parseFloat(cantidad) || 0) - 1, 0);
    setCantidad(num.toString());
    const subtotal = calcularSubtotal(num);
    onCantidadChange(producto.producto_id, num, subtotal);
  };

  const currentCantidad = parseFloat(cantidad) || 0;
  const currentUnidadesCompletas = parseFloat(unidadesCompletas) || 0;
  const currentCantidadParcial = parseFloat(cantidadParcial) || 0;
  
  const subtotal = esMateriaPrima 
    ? calcularSubtotalMateriaPrima(currentUnidadesCompletas, currentCantidadParcial) 
    : calcularSubtotal(currentCantidad);
  const hasValue = esMateriaPrima 
    ? (currentUnidadesCompletas > 0 || currentCantidadParcial > 0) 
    : currentCantidad > 0;

  // Colores según tipo
  const getBorderColor = () => {
    if (!hasValue) return '';
    switch (producto.tipo_producto) {
      case 'produccion':
        return 'ring-2 ring-blue-500 ring-opacity-50 bg-blue-50/30';
      case 'materia_prima':
        return 'ring-2 ring-yellow-500 ring-opacity-50 bg-yellow-50/30';
      default:
        return 'ring-2 ring-bakery-500 ring-opacity-50 bg-bakery-50/30';
    }
  };

  return (
    <Card className={`transition-all ${getBorderColor()}`}>
      <div className="p-3">
        <div className="flex items-center gap-3">
          {/* Información del producto */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 truncate">
              {producto.nombre}
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              {esMateriaPrima ? (
                <p className="text-sm text-yellow-600">
                  {formatCurrency(producto.precio_unitario)} / {contenidoPorUnidad} {unidadMedida}
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-500">
                    {formatCurrency(producto.precio_unitario)} c/u
                  </p>
                  {esProduccion && (
                    <span className="text-xs text-blue-600">-{porcentajeProduccion}%</span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Controles para productos normales y producción */}
          {!esMateriaPrima && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={decrementar}
                disabled={disabled || currentCantidad <= 0}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Disminuir cantidad"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>

              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                value={cantidad}
                onChange={handleCantidadChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
                disabled={disabled}
                className={`w-16 h-10 text-center text-lg font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 ${
                  esProduccion ? 'focus:ring-blue-500' : 'focus:ring-bakery-500'
                }`}
                aria-label={`Cantidad de ${producto.nombre}`}
              />

              <button
                type="button"
                onClick={incrementar}
                disabled={disabled}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  esProduccion 
                    ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' 
                    : 'bg-bakery-100 text-bakery-600 hover:bg-bakery-200'
                }`}
                aria-label="Aumentar cantidad"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Sección especial para Materia Prima */}
        {esMateriaPrima && (
          <div className="mt-3 space-y-3">
            {/* Fila 1: Unidades completas */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-600">Unidades completas:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={decrementar}
                  disabled={disabled || currentUnidadesCompletas <= 0}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={unidadesCompletas}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || (!isNaN(parseInt(v)) && parseInt(v) >= 0)) {
                      setUnidadesCompletas(v);
                    }
                  }}
                  onBlur={handleBlur}
                  onFocus={handleFocus}
                  disabled={disabled}
                  className="w-16 h-9 text-center font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={incrementar}
                  disabled={disabled}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-yellow-100 text-yellow-600 hover:bg-yellow-200 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Fila 2: Cantidad parcial (lo que sobra del bulto incompleto) */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-600">{unidadMedida} adicionales:</span>
              <input
                type="text"
                inputMode="decimal"
                value={cantidadParcial}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0)) {
                    setCantidadParcial(v);
                  }
                }}
                onBlur={handleBlur}
                disabled={disabled}
                className="w-24 h-9 text-center font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="0"
              />
            </div>

            {/* Explicación del cálculo */}
            {hasValue && (
              <div className="text-xs text-yellow-700 bg-yellow-50 rounded p-2">
                {currentUnidadesCompletas > 0 && (
                  <span>{currentUnidadesCompletas} × {formatCurrency(producto.precio_unitario)}</span>
                )}
                {currentUnidadesCompletas > 0 && currentCantidadParcial > 0 && <span> + </span>}
                {currentCantidadParcial > 0 && (
                  <span>({currentCantidadParcial}/{contenidoPorUnidad} × {formatCurrency(producto.precio_unitario)})</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Subtotal (solo si hay valor) */}
        {hasValue && (
          <div className={`mt-2 pt-2 border-t flex justify-between items-center ${
            esProduccion ? 'border-blue-200/50' : esMateriaPrima ? 'border-yellow-200/50' : 'border-bakery-200/50'
          }`}>
            <span className="text-sm text-gray-500">
              {esProduccion ? 'Subtotal (con descuento)' : 'Subtotal'}
            </span>
            <span className={`font-semibold ${
              esProduccion ? 'text-blue-600' : esMateriaPrima ? 'text-yellow-600' : 'text-bakery-600'
            }`}>
              {formatCurrency(subtotal)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
