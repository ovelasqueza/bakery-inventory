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
          created_at?: string;
          updated_at?: string;
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

export interface InventarioDetalleConProducto extends InventarioDetalle {
  productos?: Producto;
}

export interface InventarioCompleto extends Inventario {
  inventario_detalles?: InventarioDetalleConProducto[];
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
