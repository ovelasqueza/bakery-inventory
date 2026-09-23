'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Select, type SelectOption } from '@/components/ui';
import type { Producto } from '@/types/database';
import { getPorcentajeProduccion } from '@/lib/api/configuracion';

type TipoProducto = 'normal' | 'produccion' | 'materia_prima';

interface ProductoFormProps {
  producto?: Producto | null;
  onSubmit: (data: { 
    nombre: string; 
    precio_actual: number; 
    tipo_producto: TipoProducto;
    contenido_por_unidad?: number | null;
    unidad_medida?: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const unidadMedidaOptions: SelectOption[] = [
  { value: 'libras', label: 'Libras' },
  { value: 'kilos', label: 'Kilos' },
  { value: 'gramos', label: 'Gramos' },
  { value: 'unidades', label: 'Unidades' },
  { value: 'litros', label: 'Litros' },
  { value: 'mililitros', label: 'Mililitros' },
];

export function ProductoForm({
  producto,
  onSubmit,
  onCancel,
  isLoading = false,
}: ProductoFormProps) {
  const [nombre, setNombre] = useState(producto?.nombre || '');
  const [precio, setPrecio] = useState(producto?.precio_actual?.toString() || '');
  const [tipoProducto, setTipoProducto] = useState<TipoProducto>(
    (producto?.tipo_producto as TipoProducto) || 'normal'
  );
  // Campos para materia prima
  const [contenidoPorUnidad, setContenidoPorUnidad] = useState(
    producto?.contenido_por_unidad?.toString() || ''
  );
  const [unidadMedida, setUnidadMedida] = useState(producto?.unidad_medida || 'libras');
  
  const [porcentajeDescuento, setPorcentajeDescuento] = useState<number>(15);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Opciones con el porcentaje dinámico
  const tipoProductoOptions: SelectOption[] = [
    { value: 'normal', label: 'Normal (precio directo)' },
    { value: 'produccion', label: `Producción (aplica ${porcentajeDescuento}% descuento)` },
    { value: 'materia_prima', label: 'Materia Prima (por unidad/peso)' },
  ];

  useEffect(() => {
    async function loadData() {
      try {
        // Cargar porcentaje de descuento
        const porcentaje = await getPorcentajeProduccion();
        setPorcentajeDescuento(porcentaje);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!nombre.trim()) {
      newErrors.nombre = 'El nombre es requerido';
    }

    // Precio requerido para todos los tipos
    if (!precio.trim()) {
      newErrors.precio = 'El precio es requerido';
    } else {
      const precioNum = parseFloat(precio);
      if (isNaN(precioNum) || precioNum < 0) {
        newErrors.precio = 'Ingresa un precio válido';
      }
    }

    // Validación para materia prima
    if (tipoProducto === 'materia_prima') {
      if (!contenidoPorUnidad.trim()) {
        newErrors.contenido = 'El contenido por unidad es requerido';
      } else {
        const contenidoNum = parseFloat(contenidoPorUnidad);
        if (isNaN(contenidoNum) || contenidoNum <= 0) {
          newErrors.contenido = 'Ingresa un contenido válido';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    await onSubmit({
      nombre: nombre.trim(),
      precio_actual: parseFloat(precio) || 0,
      tipo_producto: tipoProducto,
      contenido_por_unidad: tipoProducto === 'materia_prima' ? parseFloat(contenidoPorUnidad) : null,
      unidad_medida: tipoProducto === 'materia_prima' ? unidadMedida : null,
    });
  };

  const getPrecioLabel = () => {
    switch (tipoProducto) {
      case 'produccion':
        return 'Precio de venta (se aplicará descuento)';
      case 'materia_prima':
        return 'Precio por unidad (bulto, kilo, etc.)';
      default:
        return 'Precio unitario';
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Nombre del producto"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={errors.nombre}
        placeholder="Ej: Bulto de harina"
        autoFocus
        disabled={isLoading}
      />

      <Select
        label="Tipo de producto"
        value={tipoProducto}
        onChange={(e) => setTipoProducto(e.target.value as TipoProducto)}
        options={tipoProductoOptions}
        disabled={isLoading}
      />

      <Input
        label={getPrecioLabel()}
        type="number"
        step="0.01"
        min="0"
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        error={errors.precio}
        placeholder="0.00"
        inputMode="decimal"
        disabled={isLoading}
      />

      {/* Campos adicionales para Materia Prima */}
      {tipoProducto === 'materia_prima' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contenido por unidad"
              type="number"
              step="0.01"
              min="0"
              value={contenidoPorUnidad}
              onChange={(e) => setContenidoPorUnidad(e.target.value)}
              error={errors.contenido}
              placeholder="Ej: 50"
              inputMode="decimal"
              disabled={isLoading}
            />
            <Select
              label="Unidad de medida"
              value={unidadMedida}
              onChange={(e) => setUnidadMedida(e.target.value)}
              options={unidadMedidaOptions}
              disabled={isLoading}
            />
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              💡 <strong>Ejemplo:</strong> Si un bulto de harina cuesta $50,000 y tiene 50 libras, 
              ingresa precio = 50,000, contenido = 50, unidad = libras.
            </p>
          </div>
        </>
      )}

      {tipoProducto === 'produccion' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            💡 Se aplicará <strong>{porcentajeDescuento}%</strong> de descuento al calcular el valor del inventario
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isLoading}
          fullWidth
        >
          Cancelar
        </Button>
        <Button type="submit" isLoading={isLoading} fullWidth>
          {producto ? 'Actualizar' : 'Crear producto'}
        </Button>
      </div>
    </form>
  );
}
