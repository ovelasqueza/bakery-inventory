-- ============================================
-- ESQUEMA DE BASE DE DATOS PARA INVENTARIO DE PANADERÍA
-- Ejecutar este script en el SQL Editor de Supabase
-- ============================================

-- Habilitar la extensión UUID si no está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA: categorias (opcional para organizar productos)
-- ============================================
CREATE TABLE IF NOT EXISTS categorias (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- ============================================
-- TABLA: productos
-- ============================================
CREATE TABLE IF NOT EXISTS productos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    precio_actual DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Índice para búsquedas por nombre
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);

-- ============================================
-- TABLA: historial_precios
-- Registra cada cambio de precio de un producto
-- ============================================
CREATE TABLE IF NOT EXISTS historial_precios (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    precio_anterior DECIMAL(10, 2),
    precio_nuevo DECIMAL(10, 2) NOT NULL,
    fecha_cambio TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    motivo TEXT
);

-- Índice para consultas por producto y fecha
CREATE INDEX IF NOT EXISTS idx_historial_precios_producto ON historial_precios(producto_id);
CREATE INDEX IF NOT EXISTS idx_historial_precios_fecha ON historial_precios(fecha_cambio DESC);

-- ============================================
-- TABLA: inventarios (cabecera del inventario)
-- ============================================
CREATE TABLE IF NOT EXISTS inventarios (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    fecha_inventario DATE NOT NULL,
    total_general DECIMAL(12, 2) DEFAULT 0.00,
    notas TEXT,
    estado VARCHAR(20) DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso', 'completado', 'cancelado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(fecha_inventario) -- Solo un inventario por fecha
);

-- Índice para búsquedas por fecha
CREATE INDEX IF NOT EXISTS idx_inventarios_fecha ON inventarios(fecha_inventario DESC);

-- ============================================
-- TABLA: inventario_detalles
-- Detalle de cada producto en el inventario
-- ============================================
CREATE TABLE IF NOT EXISTS inventario_detalles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    inventario_id UUID NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad DECIMAL(10, 2) NOT NULL DEFAULT 0,
    precio_unitario_aplicado DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(12, 2) GENERATED ALWAYS AS (cantidad * precio_unitario_aplicado) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(inventario_id, producto_id) -- Un producto solo puede aparecer una vez por inventario
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_inventario_detalles_inventario ON inventario_detalles(inventario_id);
CREATE INDEX IF NOT EXISTS idx_inventario_detalles_producto ON inventario_detalles(producto_id);

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función para actualizar el timestamp de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at automáticamente
DROP TRIGGER IF EXISTS update_categorias_updated_at ON categorias;
CREATE TRIGGER update_categorias_updated_at
    BEFORE UPDATE ON categorias
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_productos_updated_at ON productos;
CREATE TRIGGER update_productos_updated_at
    BEFORE UPDATE ON productos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventarios_updated_at ON inventarios;
CREATE TRIGGER update_inventarios_updated_at
    BEFORE UPDATE ON inventarios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventario_detalles_updated_at ON inventario_detalles;
CREATE TRIGGER update_inventario_detalles_updated_at
    BEFORE UPDATE ON inventario_detalles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Función para registrar cambios de precio automáticamente
-- ============================================
CREATE OR REPLACE FUNCTION registrar_cambio_precio()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo registrar si el precio realmente cambió
    IF OLD.precio_actual IS DISTINCT FROM NEW.precio_actual THEN
        INSERT INTO historial_precios (producto_id, precio_anterior, precio_nuevo, fecha_cambio)
        VALUES (NEW.id, OLD.precio_actual, NEW.precio_actual, TIMEZONE('utc', NOW()));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_registrar_cambio_precio ON productos;
CREATE TRIGGER trigger_registrar_cambio_precio
    AFTER UPDATE ON productos
    FOR EACH ROW
    EXECUTE FUNCTION registrar_cambio_precio();

-- ============================================
-- Función para actualizar el total general del inventario
-- ============================================
CREATE OR REPLACE FUNCTION actualizar_total_inventario()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE inventarios
        SET total_general = (
            SELECT COALESCE(SUM(subtotal), 0)
            FROM inventario_detalles
            WHERE inventario_id = OLD.inventario_id
        )
        WHERE id = OLD.inventario_id;
        RETURN OLD;
    ELSE
        UPDATE inventarios
        SET total_general = (
            SELECT COALESCE(SUM(subtotal), 0)
            FROM inventario_detalles
            WHERE inventario_id = NEW.inventario_id
        )
        WHERE id = NEW.inventario_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_actualizar_total_inventario ON inventario_detalles;
CREATE TRIGGER trigger_actualizar_total_inventario
    AFTER INSERT OR UPDATE OR DELETE ON inventario_detalles
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_total_inventario();

-- ============================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- Ajustar según necesidades de autenticación
-- ============================================

-- Por ahora, habilitamos acceso público para desarrollo
-- En producción, configura políticas adecuadas

ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_detalles ENABLE ROW LEVEL SECURITY;

-- Políticas para acceso anónimo (desarrollo)
-- IMPORTANTE: En producción, reemplazar con políticas más restrictivas

CREATE POLICY "Acceso público categorias" ON categorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso público productos" ON productos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso público historial_precios" ON historial_precios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso público inventarios" ON inventarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso público inventario_detalles" ON inventario_detalles FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- DATOS DE EJEMPLO (opcional - descomentar para poblar)
-- ============================================

-- Categorías de ejemplo
INSERT INTO categorias (nombre, descripcion) VALUES
    ('Panes', 'Todo tipo de panes'),
    ('Pasteles', 'Pasteles y tortas'),
    ('Galletas', 'Galletas dulces y saladas'),
    ('Dulces', 'Dulces tradicionales'),
    ('Bebidas', 'Bebidas preparadas')
ON CONFLICT (nombre) DO NOTHING;

-- Productos de ejemplo
-- INSERT INTO productos (nombre, categoria_id, precio_actual) VALUES
--     ('Pan francés', (SELECT id FROM categorias WHERE nombre = 'Panes'), 0.50),
--     ('Pan integral', (SELECT id FROM categorias WHERE nombre = 'Panes'), 0.75),
--     ('Croissant', (SELECT id FROM categorias WHERE nombre = 'Panes'), 1.50),
--     ('Pastel de chocolate', (SELECT id FROM categorias WHERE nombre = 'Pasteles'), 25.00),
--     ('Galletas de avena', (SELECT id FROM categorias WHERE nombre = 'Galletas'), 5.00);

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de productos con categoría
CREATE OR REPLACE VIEW vista_productos AS
SELECT 
    p.id,
    p.nombre,
    p.precio_actual,
    p.activo,
    c.nombre AS categoria_nombre,
    c.id AS categoria_id,
    p.created_at,
    p.updated_at
FROM productos p
LEFT JOIN categorias c ON p.categoria_id = c.id
WHERE p.activo = true
ORDER BY c.nombre, p.nombre;

-- Vista de inventarios con resumen
CREATE OR REPLACE VIEW vista_inventarios AS
SELECT 
    i.id,
    i.fecha_inventario,
    i.total_general,
    i.estado,
    i.notas,
    COUNT(id2.id) AS total_productos,
    i.created_at,
    i.updated_at
FROM inventarios i
LEFT JOIN inventario_detalles id2 ON i.id = id2.inventario_id
GROUP BY i.id
ORDER BY i.fecha_inventario DESC;

-- ============================================
-- FIN DEL SCRIPT
-- ============================================
