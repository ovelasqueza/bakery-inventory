'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Select, type SelectOption } from '@/components/ui';
import type { Producto } from '@/types/database';
import { getPorcentajeProduccion } from '@/lib/api/configuracion';
import { conMiles, textoMiles } from '@/lib/caja/validacion';
import { FotoProducto } from './FotoProducto';

type TipoProducto = 'normal' | 'produccion' | 'materia_prima';

interface ProductoFormProps {
  producto?: Producto | null;
  onSubmit: (data: { 
    nombre: string; 
    precio_actual: number; 
    /** Precio de venta al público en COP enteros (Caja). Solo se envía si aplica. */
    precio_venta?: number | null;
    tipo_producto: TipoProducto;
    contenido_por_unidad?: number | null;
    unidad_medida?: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  /** Se llama cuando la foto del producto se sube o se quita (Req 10.1). */
  onFotoCambio?: (nuevoPath: string | null) => void;
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
  onFotoCambio,
}: ProductoFormProps) {
  const [nombre, setNombre] = useState(producto?.nombre || '');
  const [precio, setPrecio] = useState(producto?.precio_actual?.toString() || '');
  const [precioVenta, setPrecioVenta] = useState(
    producto?.precio_venta !== null && producto?.precio_venta !== undefined ? textoMiles(producto.precio_venta) : ''
  );
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

    // Precio de venta al público: opcional, peso entero (la Caja no maneja centavos)
    if (tipoProducto !== 'materia_prima' && precioVenta.trim()) {
      const venta = precioVenta.trim();
      if (!/^\d+$/.test(venta.replace(/\./g, '')) || Number(venta.replace(/\./g, '')) > 99_999_999) {
        newErrors.precioVenta = 'Ingresa un valor entero en pesos, sin comas ni decimales';
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

    // precio_venta: la materia prima no se vende (null). Si el campo está vacío y el producto
    // no tenía la columna (migración sin aplicar), no se envía para no romper el guardado.
    const ventaTexto = precioVenta.trim();
    const columnaVentaExiste = producto ? producto.precio_venta !== undefined : false;
    let precio_venta: number | null | undefined;
    if (tipoProducto === 'materia_prima') {
      precio_venta = columnaVentaExiste ? null : undefined;
    } else if (ventaTexto) {
      precio_venta = Number(ventaTexto.replace(/\./g, ''));
    } else {
      precio_venta = columnaVentaExiste ? null : undefined;
    }

    await onSubmit({
      nombre: nombre.trim(),
      precio_actual: parseFloat(precio) || 0,
      ...(precio_venta !== undefined ? { precio_venta } : {}),
      tipo_producto: tipoProducto,
      contenido_por_unidad: tipoProducto === 'materia_prima' ? parseFloat(contenidoPorUnidad) : null,
      unidad_medida: tipoProducto === 'materia_prima' ? unidadMedida : null,
    });
  };

  const getPrecioLabel = () => {
    switch (tipoProducto) {
      case 'produccion':
        return 'Precio para inventario (se aplicará descuento)';
      case 'materia_prima':
        return 'Precio por unidad (bulto, kilo, etc.)';
      default:
        return 'Costo unitario (para inventario)';
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

      {tipoProducto !== 'materia_prima' && (
        <div className="space-y-1">
          <Input
            label="Precio de venta al público (Caja)"
            type="text"
            value={precioVenta}
            onChange={(e) => setPrecioVenta(conMiles(e.target.value))}
            error={errors.precioVenta}
            placeholder="Ej: 2.500"
            inputMode="numeric"
            maxLength={10}
            disabled={isLoading}
          />
          {!errors.precioVenta && (
            <p className="text-xs text-gray-500">
              Es lo que cobra el cajero. Si lo dejas vacío, el producto no aparece en la Caja.
            </p>
          )}
        </div>
      )}
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

      {/* Foto: solo al editar un producto que no es materia prima (Req 10.1) */}
      {producto && tipoProducto !== 'materia_prima' && (
        <FotoProducto
          productoId={producto.id}
          imagenPath={producto.imagen_path ?? null}
          onCambio={onFotoCambio}
        />
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
