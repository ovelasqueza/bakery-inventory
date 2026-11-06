-- ============================================
-- MIGRACIÓN: Categorías de productos (activar / desactivar)
-- Ejecutar este script en el SQL Editor de Supabase
--
-- Es idempotente: se puede ejecutar varias veces sin error.
-- Agrega la columna `activo` a `categorias`, unicidad por nombre
-- normalizado y un trigger para que al desactivar una categoría
-- los productos asociados queden sin categoría (`categoria_id = NULL`).
-- ============================================

-- 1. Columna activo en categorias (las filas actuales quedan activas)
ALTER TABLE categorias
ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Índice único sin distinguir mayúsculas, tildes ni espacios extremos
CREATE UNIQUE INDEX IF NOT EXISTS categorias_nombre_unico
    ON categorias (normalizar_nombre(nombre));

-- 3. Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS update_categorias_updated_at ON categorias;
CREATE TRIGGER update_categorias_updated_at
    BEFORE UPDATE ON categorias
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Al desactivar una categoría, dejar sin categoría los productos que la tenían
CREATE OR REPLACE FUNCTION desasignar_categoria_desactivada()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.activo IS TRUE AND NEW.activo IS FALSE THEN
        UPDATE productos
        SET categoria_id = NULL
        WHERE categoria_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_desasignar_categoria_desactivada ON categorias;
CREATE TRIGGER trigger_desasignar_categoria_desactivada
    AFTER UPDATE OF activo ON categorias
    FOR EACH ROW
    EXECUTE FUNCTION desasignar_categoria_desactivada();

ALTER TABLE categorias DISABLE ROW LEVEL SECURITY;
