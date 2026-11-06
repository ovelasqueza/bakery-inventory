-- ============================================
-- MIGRACIÓN: Vales de empleados (consumo de productos o dinero de caja)
-- Ejecutar este script en el SQL Editor de Supabase DESPUÉS de
-- supabase/migration-barra-acciones.sql.
--
-- Es idempotente: se puede ejecutar varias veces sin error.
--
-- Reglas de negocio:
--   - Un vale registra un monto en pesos (1..10.000.000), quién lo saca
--     (empleado), la descripción y si sale dinero en efectivo de la caja
--     (sale_de_caja = true) o si es por producto/consumo (sale_de_caja = false).
--   - Funciona de manera independiente para el reporte de descuento de nómina/pago.
--   - Si sale_de_caja = true, el valor se resta de efectivo_esperado_turno(p_turno)
--     para que cuadre el turno al cerrar caja.
-- ============================================

-- 1. Tabla de vales
CREATE TABLE IF NOT EXISTS vales (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    clave UUID NOT NULL UNIQUE,
    turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,
    empleado VARCHAR(60) NOT NULL
        CHECK (length(trim(empleado)) BETWEEN 1 AND 60),
    valor INTEGER NOT NULL
        CHECK (valor BETWEEN 1 AND 10000000),
    descripcion VARCHAR(120) NOT NULL
        CHECK (length(trim(descripcion)) BETWEEN 1 AND 120),
    sale_de_caja BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    eliminado_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS vales_turno ON vales (turno_id);
CREATE INDEX IF NOT EXISTS vales_creado_en ON vales (creado_en);

-- 2. Seguridad (RLS solo lectura; escritura por RPC SECURITY DEFINER)
ALTER TABLE vales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vales_leer" ON vales;
CREATE POLICY "vales_leer" ON vales
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- 3. Inmutabilidad: solo se permite marcar eliminado_en una vez con el turno abierto
CREATE OR REPLACE FUNCTION proteger_vales()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: los vales no se borran';
    END IF;

    IF NOT (OLD.eliminado_en IS NULL AND NEW.eliminado_en IS NOT NULL) THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: solo se permite anular un vale vigente';
    END IF;

    IF (NEW.id, NEW.clave, NEW.turno_id, NEW.empleado, NEW.valor,
        NEW.descripcion, NEW.sale_de_caja, NEW.creado_en)
        IS DISTINCT FROM
       (OLD.id, OLD.clave, OLD.turno_id, OLD.empleado, OLD.valor,
        OLD.descripcion, OLD.sale_de_caja, OLD.creado_en) THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: al anular solo cambia eliminado_en';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM turnos WHERE id = OLD.turno_id AND cerrado_en IS NULL
    ) THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_vales ON vales;
CREATE TRIGGER trigger_proteger_vales
    BEFORE UPDATE OR DELETE ON vales
    FOR EACH ROW
    EXECUTE FUNCTION proteger_vales();

-- 4. Actualizar efectivo_esperado_turno para restar los vales que salen de caja
CREATE OR REPLACE FUNCTION efectivo_esperado_turno(p_turno UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_base INTEGER;
    v_ventas BIGINT;
    v_gastos BIGINT;
    v_retiros BIGINT;
    v_vales_caja BIGINT;
BEGIN
    SELECT base INTO v_base FROM turnos WHERE id = p_turno;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(sum(total), 0) INTO v_ventas
    FROM ventas
    WHERE turno_id = p_turno AND estado = 'registrada' AND es_efectivo;

    SELECT COALESCE(sum(g.valor - COALESCE(o.mayor, 0)), 0) INTO v_gastos
    FROM gastos g
    LEFT JOIN LATERAL (
        SELECT sum(go.valor) AS mayor
        FROM gasto_origenes go
        WHERE go.gasto_id = g.id AND go.parte_id IS NOT NULL
    ) o ON TRUE
    WHERE g.turno_id = p_turno AND g.eliminado_en IS NULL;

    SELECT COALESCE(sum(valor), 0) INTO v_retiros
    FROM caja_mayor_movimientos
    WHERE turno_id = p_turno AND tipo = 'retiro';

    SELECT COALESCE(sum(valor), 0) INTO v_vales_caja
    FROM vales
    WHERE turno_id = p_turno AND sale_de_caja = TRUE AND eliminado_en IS NULL;

    RETURN (v_base + v_ventas - v_gastos - v_retiros - v_vales_caja)::INTEGER;
END;
$$;

-- 5. RPC registrar_vale
CREATE OR REPLACE FUNCTION registrar_vale(
    p_clave UUID,
    p_turno UUID,
    p_empleado TEXT,
    p_valor INTEGER,
    p_descripcion TEXT,
    p_sale_de_caja BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_v vales%ROWTYPE;
    v_cerrado_en TIMESTAMPTZ;
    v_empleado TEXT;
    v_descripcion TEXT;
BEGIN
    IF p_clave IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    SELECT * INTO v_v FROM vales WHERE clave = p_clave;

    IF NOT FOUND THEN
        SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = p_turno FOR UPDATE;
        IF NOT FOUND OR v_cerrado_en IS NOT NULL THEN
            RAISE EXCEPTION 'TURNO_CERRADO';
        END IF;

        SELECT * INTO v_v FROM vales WHERE clave = p_clave;
    END IF;

    IF NOT FOUND THEN
        v_empleado := trim(p_empleado);
        v_descripcion := trim(p_descripcion);

        IF v_empleado IS NULL OR length(v_empleado) NOT BETWEEN 1 AND 60
            OR p_valor IS NULL OR p_valor NOT BETWEEN 1 AND 10000000
            OR v_descripcion IS NULL OR length(v_descripcion) NOT BETWEEN 1 AND 120
            OR p_sale_de_caja IS NULL THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        INSERT INTO vales (clave, turno_id, empleado, valor, descripcion, sale_de_caja)
        VALUES (p_clave, p_turno, v_empleado, p_valor, v_descripcion, p_sale_de_caja)
        RETURNING * INTO v_v;
    END IF;

    RETURN jsonb_build_object(
        'id', v_v.id,
        'turno_id', v_v.turno_id,
        'empleado', v_v.empleado,
        'valor', v_v.valor,
        'descripcion', v_v.descripcion,
        'sale_de_caja', v_v.sale_de_caja,
        'creado_en', v_v.creado_en
    );
END;
$$;

-- 6. RPC eliminar_vale
CREATE OR REPLACE FUNCTION eliminar_vale(p_vale UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_turno UUID;
    v_cerrado_en TIMESTAMPTZ;
    v_eliminado_en TIMESTAMPTZ;
BEGIN
    SELECT turno_id INTO v_turno FROM vales WHERE id = p_vale;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VALE_NO_EXISTE';
    END IF;

    SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = v_turno FOR UPDATE;
    SELECT eliminado_en INTO v_eliminado_en FROM vales WHERE id = p_vale FOR UPDATE;

    IF v_eliminado_en IS NOT NULL THEN
        RETURN;
    END IF;

    IF v_cerrado_en IS NOT NULL THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    UPDATE vales SET eliminado_en = NOW() WHERE id = p_vale;
END;
$$;

REVOKE ALL ON FUNCTION efectivo_esperado_turno(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION registrar_vale(UUID, UUID, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION eliminar_vale(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION efectivo_esperado_turno(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_vale(UUID, UUID, TEXT, INTEGER, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION eliminar_vale(UUID) TO anon, authenticated;
