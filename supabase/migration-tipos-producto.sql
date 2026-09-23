-- ============================================
-- MIGRACIÓN: Agregar tipos de producto y configuración
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

-- 1. Agregar columna tipo_producto a la tabla productos
ALTER TABLE productos 
ADD COLUMN IF NOT EXISTS tipo_producto VARCHAR(20) DEFAULT 'normal' 
CHECK (tipo_producto IN ('normal', 'produccion', 'materia_prima'));

-- 2. Crear tabla de configuración
CREATE TABLE IF NOT EXISTS configuracion (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    clave VARCHAR(100) NOT NULL UNIQUE,
    valor TEXT NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_configuracion_updated_at ON configuracion;
CREATE TRIGGER update_configuracion_updated_at
    BEFORE UPDATE ON configuracion
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. Insertar configuración inicial
INSERT INTO configuracion (clave, valor, descripcion) VALUES
    ('porcentaje_descuento_produccion', '15', 'Porcentaje de descuento para productos de producción (pan, pasteles, etc.)')
ON CONFLICT (clave) DO NOTHING;

-- 4. Desactivar RLS para la nueva tabla
ALTER TABLE configuracion DISABLE ROW LEVEL SECURITY;

-- 5. Verificar cambios
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'productos' AND column_name = 'tipo_producto';

SELECT * FROM configuracion;
