// Tipos generados para la base de datos de Supabase
// Estos tipos reflejan la estructura de las tablas definidas en schema.sql

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      inventario_facturas: {
        Row: {
          id: string;
          inventario_id: string;
          nombre: string;
          valor: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inventario_id: string;
          nombre: string;
          valor: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          inventario_id?: string;
          nombre?: string;
          valor?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      productos: {
        Row: {
          id: string;
          nombre: string;
          precio_actual: number;
          tipo_producto: 'normal' | 'produccion' | 'materia_prima';
          // Campos para materia prima
          contenido_por_unidad: number | null; // ej: 50 (libras por bulto)
          unidad_medida: string | null; // ej: "libras", "gramos", "kilos"
          activo: boolean;
          // Campos de caja (migration-ventas.sql)
          categoria_id: string | null;
          imagen_path: string | null; // ruta en el bucket "productos": {productoId}-{ms}.webp
          visible_caja: boolean; // DEFAULT TRUE
          orden_caja: number; // entero 0..9999, DEFAULT 0
          precio_venta: number | null; // precio al público en COP enteros; NULL = no se vende en Caja
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          precio_actual?: number;
          tipo_producto?: 'normal' | 'produccion' | 'materia_prima';
          contenido_por_unidad?: number | null;
          unidad_medida?: string | null;
          activo?: boolean;
          categoria_id?: string | null;
          imagen_path?: string | null;
          visible_caja?: boolean;
          orden_caja?: number;
          precio_venta?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          precio_actual?: number;
          tipo_producto?: 'normal' | 'produccion' | 'materia_prima';
          contenido_por_unidad?: number | null;
          unidad_medida?: string | null;
          activo?: boolean;
          categoria_id?: string | null;
          imagen_path?: string | null;
          visible_caja?: boolean;
          orden_caja?: number;
          precio_venta?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      // ---- Tablas de parámetros de caja (RLS desactivado) ----
      metodos_pago: {
        Row: {
          id: string;
          nombre: string; // 1..40 caracteres
          es_efectivo: boolean;
          activo: boolean;
          orden: number; // entero 0..999
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          es_efectivo?: boolean;
          activo?: boolean;
          orden?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          es_efectivo?: boolean;
          activo?: boolean;
          orden?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      categorias_gasto: {
        Row: {
          id: string;
          nombre: string; // 1..40 caracteres
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      personas_caja: {
        Row: {
          id: string;
          nombre: string; // 1..60 caracteres
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      // ---- Tablas de movimientos (RLS: solo SELECT; se escriben con RPC) ----
      // Todos los montos son enteros en COP.
      turnos: {
        Row: {
          id: string;
          clave_apertura: string;
          abierto_por: string;
          base: number;
          abierto_en: string;
          cerrado_en: string | null;
          cerrado_por: string | null;
          clave_cierre: string | null;
          efectivo_contado: number | null;
          efectivo_esperado: number | null;
          diferencia: number | null;
        };
        Insert: {
          id?: string;
          clave_apertura: string;
          abierto_por: string;
          base: number;
          abierto_en?: string;
          cerrado_en?: string | null;
          cerrado_por?: string | null;
          clave_cierre?: string | null;
          efectivo_contado?: number | null;
          efectivo_esperado?: number | null;
          diferencia?: number | null;
        };
        Update: {
          id?: string;
          clave_apertura?: string;
          abierto_por?: string;
          base?: number;
          abierto_en?: string;
          cerrado_en?: string | null;
          cerrado_por?: string | null;
          clave_cierre?: string | null;
          efectivo_contado?: number | null;
          efectivo_esperado?: number | null;
          diferencia?: number | null;
        };
      };
      ventas: {
        Row: {
          id: string;
          clave: string;
          turno_id: string;
          creado_en: string;
          total: number;
          metodo_pago_id: string;
          es_efectivo: boolean; // copia del método al vender
          efectivo_recibido: number;
          cambio: number;
          estado: 'registrada' | 'anulada';
          anulada_en: string | null;
          anulada_por: string | null;
          motivo_anulacion: string | null;
          clave_anulacion: string | null;
        };
        Insert: {
          id?: string;
          clave: string;
          turno_id: string;
          creado_en?: string;
          total: number;
          metodo_pago_id: string;
          es_efectivo: boolean;
          efectivo_recibido: number;
          cambio: number;
          estado?: 'registrada' | 'anulada';
          anulada_en?: string | null;
          anulada_por?: string | null;
          motivo_anulacion?: string | null;
          clave_anulacion?: string | null;
        };
        Update: {
          id?: string;
          clave?: string;
          turno_id?: string;
          creado_en?: string;
          total?: number;
          metodo_pago_id?: string;
          es_efectivo?: boolean;
          efectivo_recibido?: number;
          cambio?: number;
          estado?: 'registrada' | 'anulada';
          anulada_en?: string | null;
          anulada_por?: string | null;
          motivo_anulacion?: string | null;
          clave_anulacion?: string | null;
        };
      };
      venta_detalles: {
        Row: {
          id: string;
          venta_id: string;
          producto_id: string;
          nombre_producto: string; // copia del nombre al vender
          cantidad: number; // entero 1..999
          precio_unitario: number;
          subtotal: number; // columna generada: cantidad * precio_unitario
        };
        Insert: {
          id?: string;
          venta_id: string;
          producto_id: string;
          nombre_producto: string;
          cantidad: number;
          precio_unitario: number;
        };
        Update: {
          id?: string;
          venta_id?: string;
          producto_id?: string;
          nombre_producto?: string;
          cantidad?: number;
          precio_unitario?: number;
        };
      };
      gastos: {
        Row: {
          id: string;
          clave: string;
          turno_id: string;
          valor: number; // entero 1..10.000.000
          concepto: string; // 1..120 caracteres
          categoria_gasto_id: string;
          registrado_por: string;
          creado_en: string;
          eliminado_en: string | null;
        };
        Insert: {
          id?: string;
          clave: string;
          turno_id: string;
          valor: number;
          concepto: string;
          categoria_gasto_id: string;
          registrado_por: string;
          creado_en?: string;
          eliminado_en?: string | null;
        };
        Update: {
          id?: string;
          clave?: string;
          turno_id?: string;
          valor?: number;
          concepto?: string;
          categoria_gasto_id?: string;
          registrado_por?: string;
          creado_en?: string;
          eliminado_en?: string | null;
        };
      };
      historial_precios: {
        Row: {
          id: string;
          producto_id: string;
          precio_anterior: number | null;
          precio_nuevo: number;
          fecha_cambio: string;
          motivo: string | null;
        };
        Insert: {
          id?: string;
          producto_id: string;
          precio_anterior?: number | null;
          precio_nuevo: number;
          fecha_cambio?: string;
          motivo?: string | null;
        };
        Update: {
          id?: string;
          producto_id?: string;
          precio_anterior?: number | null;
          precio_nuevo?: number;
          fecha_cambio?: string;
          motivo?: string | null;
        };
      };
      inventarios: {
        Row: {
          id: string;
          fecha_inventario: string;
          total_general: number;
          notas: string | null;
          estado: 'en_proceso' | 'completado' | 'cancelado';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          fecha_inventario: string;
          total_general?: number;
          notas?: string | null;
          estado?: 'en_proceso' | 'completado' | 'cancelado';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          fecha_inventario?: string;
          total_general?: number;
          notas?: string | null;
          estado?: 'en_proceso' | 'completado' | 'cancelado';
          created_at?: string;
          updated_at?: string;
        };
      };
      inventario_detalles: {
        Row: {
          id: string;
          inventario_id: string;
          producto_id: string;
          cantidad: number;
          precio_unitario_aplicado: number;
          subtotal: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inventario_id: string;
          producto_id: string;
          cantidad?: number;
          precio_unitario_aplicado: number;
          subtotal?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          inventario_id?: string;
          producto_id?: string;
          cantidad?: number;
          precio_unitario_aplicado?: number;
          subtotal?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      configuracion: {
        Row: {
          id: string;
          clave: string;
          valor: string;
          descripcion: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clave: string;
          valor: string;
          descripcion?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clave?: string;
          valor?: string;
          descripcion?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Tipos de conveniencia para usar en la aplicación
export type Producto = Database['public']['Tables']['productos']['Row'];
export type ProductoInsert = Database['public']['Tables']['productos']['Insert'];
export type ProductoUpdate = Database['public']['Tables']['productos']['Update'];

export type HistorialPrecio = Database['public']['Tables']['historial_precios']['Row'];
export type HistorialPrecioInsert = Database['public']['Tables']['historial_precios']['Insert'];

export type Inventario = Database['public']['Tables']['inventarios']['Row'];
export type InventarioInsert = Database['public']['Tables']['inventarios']['Insert'];
export type InventarioUpdate = Database['public']['Tables']['inventarios']['Update'];

export type InventarioDetalle = Database['public']['Tables']['inventario_detalles']['Row'];
export type InventarioDetalleInsert = Database['public']['Tables']['inventario_detalles']['Insert'];
export type InventarioDetalleUpdate = Database['public']['Tables']['inventario_detalles']['Update'];

export type Configuracion = Database['public']['Tables']['configuracion']['Row'];

export type InventarioFactura = Database['public']['Tables']['inventario_facturas']['Row'];
export type InventarioFacturaInsert = Database['public']['Tables']['inventario_facturas']['Insert'];
export type InventarioFacturaUpdate = Database['public']['Tables']['inventario_facturas']['Update'];

export type MetodoPago = Database['public']['Tables']['metodos_pago']['Row'];
export type MetodoPagoInsert = Database['public']['Tables']['metodos_pago']['Insert'];
export type MetodoPagoUpdate = Database['public']['Tables']['metodos_pago']['Update'];

export type CategoriaGasto = Database['public']['Tables']['categorias_gasto']['Row'];
export type CategoriaGastoInsert = Database['public']['Tables']['categorias_gasto']['Insert'];
export type CategoriaGastoUpdate = Database['public']['Tables']['categorias_gasto']['Update'];

export type PersonaCaja = Database['public']['Tables']['personas_caja']['Row'];
export type PersonaCajaInsert = Database['public']['Tables']['personas_caja']['Insert'];
export type PersonaCajaUpdate = Database['public']['Tables']['personas_caja']['Update'];

export type Turno = Database['public']['Tables']['turnos']['Row'];
export type Venta = Database['public']['Tables']['ventas']['Row'];
export type EstadoVenta = Venta['estado'];
export type VentaDetalle = Database['public']['Tables']['venta_detalles']['Row'];
export type Gasto = Database['public']['Tables']['gastos']['Row'];

export interface InventarioDetalleConProducto extends InventarioDetalle {
  productos?: Producto;
}

export interface InventarioCompleto extends Inventario {
  inventario_detalles?: InventarioDetalleConProducto[];
  inventario_facturas?: InventarioFactura[];
}

// Tipo para el formulario de inventario en la UI
export interface ProductoInventario {
  producto_id: string;
  nombre: string;
  tipo_producto: 'normal' | 'produccion' | 'materia_prima';
  precio_unitario: number;
  // Campos para materia prima
  contenido_por_unidad: number | null;
  unidad_medida: string | null;
  cantidad: number;
  subtotal: number;
}
