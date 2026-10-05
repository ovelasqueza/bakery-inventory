-- ============================================
-- MIGRACIÓN: Agregar facturas a inventarios
-- Ejecutar este script en el SQL Editor de Supabase
-- ============================================

-- Tabla para facturas asociadas a un inventario
CREATE TABLE IF NOT EXISTS inventario_facturas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    inventario_id UUID NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    valor DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Índice para consultas por inventario
CREATE INDEX IF NOT EXISTS idx_inventario_facturas_inventario ON inventario_facturas(inventario_id);

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS update_inventario_facturas_updated_at ON inventario_facturas;
CREATE TRIGGER update_inventario_facturas_updated_at
    BEFORE UPDATE ON inventario_facturas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS
ALTER TABLE inventario_facturas ENABLE ROW LEVEL SECURITY;

-- Política de acceso (igual que las otras tablas)
CREATE POLICY "Acceso público inventario_facturas" ON inventario_facturas 
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- FIN DEL SCRIPT
-- ============================================
