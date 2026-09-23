-- ============================================
-- SCRIPT PARA CORREGIR POLÍTICAS RLS
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

-- Primero, eliminar las políticas existentes
DROP POLICY IF EXISTS "Acceso público categorias" ON categorias;
DROP POLICY IF EXISTS "Acceso público productos" ON productos;
DROP POLICY IF EXISTS "Acceso público historial_precios" ON historial_precios;
DROP POLICY IF EXISTS "Acceso público inventarios" ON inventarios;
DROP POLICY IF EXISTS "Acceso público inventario_detalles" ON inventario_detalles;

-- Opción 1: DESACTIVAR RLS completamente (más fácil para desarrollo)
ALTER TABLE categorias DISABLE ROW LEVEL SECURITY;
ALTER TABLE productos DISABLE ROW LEVEL SECURITY;
ALTER TABLE historial_precios DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_detalles DISABLE ROW LEVEL SECURITY;

-- Verificar que las tablas existen
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('categorias', 'productos', 'historial_precios', 'inventarios', 'inventario_detalles');

-- Insertar categorías de ejemplo si no existen
INSERT INTO categorias (nombre, descripcion) VALUES
    ('Panes', 'Todo tipo de panes'),
    ('Pasteles', 'Pasteles y tortas'),
    ('Galletas', 'Galletas dulces y saladas'),
    ('Dulces', 'Dulces tradicionales'),
    ('Bebidas', 'Bebidas preparadas')
ON CONFLICT (nombre) DO NOTHING;

-- Verificar categorías
SELECT * FROM categorias;
