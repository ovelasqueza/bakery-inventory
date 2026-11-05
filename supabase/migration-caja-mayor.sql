-- ============================================
-- MIGRACIÓN: Caja mayor y cierre a ciegas
-- Ejecutar este script en el SQL Editor de Supabase DESPUÉS de
-- supabase/migration-ventas.sql (usa sus tablas, funciones y triggers).
--
-- Es idempotente: se puede ejecutar varias veces sin error.
-- Usa IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS + CREATE
-- y datos iniciales con WHERE NOT EXISTS / ON CONFLICT DO NOTHING.
-- No borra ni renombra tablas, columnas ni filas existentes.
--
-- Compatibilidad con los datos existentes:
--   - Los gastos sin filas en gasto_origenes cuentan como 100 % cajón.
--   - Los turnos cerrados antes de esta migración quedan con
--     base_siguiente y enviado_mayor nulos.
--
-- Secciones:
--   1. Tablas de la Caja mayor (saldos, movimientos, orígenes de gasto)
--   2. Partes iniciales y Parte automática para métodos no efectivo
--   3. Cambios en turnos y gastos
--   4. Triggers de inmutabilidad
--   5. Seguridad (RLS de solo lectura)
--   6. Funciones auxiliares, fórmula del esperado, apertura y cierre
--   7. Gastos con origen, retiros y RPC de Caja mayor
-- ============================================


-- ============================================
-- 1. TABLAS DE LA CAJA MAYOR
-- Montos en pesos colombianos enteros. Saldos y movimientos en BIGINT
-- porque acumulan muchos turnos.
-- ============================================

-- --------------------------------------------
-- TABLA: caja_mayor_saldos
-- Una fila por Parte:
--   - Parte Efectivo: una sola fila con metodo_pago_id NULL. Recibe el
--     efectivo de todos los métodos con es_efectivo.
--   - Una Parte por cada método no efectivo (metodo_pago_id único).
-- Los métodos de pago solo se desactivan, nunca se borran (RESTRICT).
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS caja_mayor_saldos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    metodo_pago_id UUID UNIQUE REFERENCES metodos_pago(id) ON DELETE RESTRICT,
    saldo BIGINT NOT NULL DEFAULT 0
        CONSTRAINT caja_mayor_saldo_no_negativo CHECK (saldo >= 0),
    actualizado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Una única Parte Efectivo
CREATE UNIQUE INDEX IF NOT EXISTS caja_mayor_una_efectivo
    ON caja_mayor_saldos ((TRUE)) WHERE metodo_pago_id IS NULL;

-- --------------------------------------------
-- TABLA: caja_mayor_movimientos
-- Inmutable. valor con signo: + entra a la Parte, − sale.
-- Los movimientos de $ 0 no se guardan.
-- clave: idempotencia de retiros y ajustes.
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS caja_mayor_movimientos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    clave UUID UNIQUE,
    parte_id UUID NOT NULL REFERENCES caja_mayor_saldos(id) ON DELETE RESTRICT,
    tipo VARCHAR(20) NOT NULL
        CHECK (tipo IN ('cierre_turno', 'retiro', 'gasto', 'eliminacion_gasto', 'ajuste')),
    valor BIGINT NOT NULL CHECK (valor <> 0),
    saldo_despues BIGINT NOT NULL CHECK (saldo_despues >= 0),
    persona VARCHAR(60),
    descripcion VARCHAR(200),
    turno_id UUID REFERENCES turnos(id) ON DELETE RESTRICT,
    gasto_id UUID REFERENCES gastos(id) ON DELETE RESTRICT,
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- Cada tipo lleva sus datos obligatorios y el signo correcto
    CONSTRAINT movimiento_coherente CHECK (
        (tipo = 'cierre_turno' AND turno_id IS NOT NULL AND valor > 0)
        OR
        (tipo = 'retiro' AND turno_id IS NOT NULL AND clave IS NOT NULL
            AND valor > 0 AND persona IS NOT NULL)
        OR
        (tipo = 'gasto' AND gasto_id IS NOT NULL AND valor < 0)
        OR
        (tipo = 'eliminacion_gasto' AND gasto_id IS NOT NULL AND valor > 0)
        OR
        (tipo = 'ajuste' AND clave IS NOT NULL AND persona IS NOT NULL
            AND descripcion IS NOT NULL
            AND length(trim(descripcion)) BETWEEN 3 AND 200)
    )
);

CREATE INDEX IF NOT EXISTS caja_mayor_mov_creado_en
    ON caja_mayor_movimientos (creado_en);
CREATE INDEX IF NOT EXISTS caja_mayor_mov_turno
    ON caja_mayor_movimientos (turno_id) WHERE turno_id IS NOT NULL;

-- --------------------------------------------
-- TABLA: gasto_origenes
-- De dónde sale el dinero de un gasto. parte_id NULL = Cajón.
-- La suma de valor de un gasto es igual a gastos.valor (lo valida
-- registrar_gasto). Un gasto sin filas aquí es 100 % Cajón.
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS gasto_origenes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    gasto_id UUID NOT NULL REFERENCES gastos(id) ON DELETE RESTRICT,
    parte_id UUID REFERENCES caja_mayor_saldos(id) ON DELETE RESTRICT,
    valor INTEGER NOT NULL CHECK (valor BETWEEN 1 AND 10000000)
);

-- Una fila por fuente en cada gasto (el Cajón cuenta como una fuente)
CREATE UNIQUE INDEX IF NOT EXISTS gasto_origenes_unica
    ON gasto_origenes (gasto_id, COALESCE(parte_id, '00000000-0000-0000-0000-000000000000'::uuid));


-- ============================================
-- 2. PARTES INICIALES
-- La Parte Efectivo y una Parte por cada método no efectivo (también
-- los inactivos y los que tuvieron ventas no efectivo). Los métodos
-- nuevos o que dejan de ser efectivo reciben su Parte con un trigger.
-- Si un método pasa a es_efectivo, su Parte se conserva con su saldo.
-- ============================================

INSERT INTO caja_mayor_saldos (metodo_pago_id)
SELECT NULL
WHERE NOT EXISTS (
    SELECT 1 FROM caja_mayor_saldos WHERE metodo_pago_id IS NULL
);

INSERT INTO caja_mayor_saldos (metodo_pago_id)
SELECT m.id
FROM metodos_pago m
WHERE NOT m.es_efectivo
   OR EXISTS (SELECT 1 FROM ventas v WHERE v.metodo_pago_id = m.id AND NOT v.es_efectivo)
ON CONFLICT (metodo_pago_id) DO NOTHING;

-- SECURITY DEFINER: la aplicación edita metodos_pago con la llave anon,
-- que no puede escribir en caja_mayor_saldos (RLS de solo lectura).
CREATE OR REPLACE FUNCTION crear_parte_metodo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
    IF NOT NEW.es_efectivo THEN
        INSERT INTO caja_mayor_saldos (metodo_pago_id)
        VALUES (NEW.id)
        ON CONFLICT (metodo_pago_id) DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_crear_parte_metodo ON metodos_pago;
CREATE TRIGGER trigger_crear_parte_metodo
    AFTER INSERT OR UPDATE OF es_efectivo ON metodos_pago
    FOR EACH ROW
    EXECUTE FUNCTION crear_parte_metodo();


-- ============================================
-- 3. CAMBIOS EN turnos Y gastos
-- ============================================

-- Base que quien cierra deja para el siguiente turno y efectivo que
-- pasa a la Parte Efectivo (contado − base_siguiente).
-- Nulos en turnos abiertos y en turnos cerrados antes de esta migración.
-- proteger_turnos no cambia: se llenan en el mismo UPDATE que cierra.
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS base_siguiente INTEGER;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS enviado_mayor INTEGER;

ALTER TABLE turnos DROP CONSTRAINT IF EXISTS turnos_base_siguiente_coherente;
ALTER TABLE turnos ADD CONSTRAINT turnos_base_siguiente_coherente CHECK (
    (base_siguiente IS NULL AND enviado_mayor IS NULL)
    OR
    (cerrado_en IS NOT NULL
        AND efectivo_contado IS NOT NULL
        AND base_siguiente IS NOT NULL
        AND enviado_mayor IS NOT NULL
        AND base_siguiente BETWEEN 0 AND efectivo_contado
        AND enviado_mayor = efectivo_contado - base_siguiente)
);

-- Gasto_Sin_Turno: gasto registrado desde Reportes, solo con Partes.
-- No falla si la columna ya acepta nulos.
ALTER TABLE gastos ALTER COLUMN turno_id DROP NOT NULL;


-- ============================================
-- 4. TRIGGERS DE INMUTABILIDAD
-- Se aplican a cualquier rol, incluidas las RPC. Solo permiten:
--   gastos:                  llenar eliminado_en una vez; si tiene turno,
--                            con el turno abierto
--   caja_mayor_movimientos:  nada
--   gasto_origenes:          nada
--   caja_mayor_saldos:       cambiar el saldo (por RPC); no se borra
-- ============================================

-- --------------------------------------------
-- gastos (reemplaza la versión de migration-ventas.sql)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION proteger_gastos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: los gastos no se borran';
    END IF;

    IF NOT (OLD.eliminado_en IS NULL AND NEW.eliminado_en IS NOT NULL) THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: solo se permite marcar el gasto como eliminado';
    END IF;

    -- Solo cambia eliminado_en
    IF (NEW.id, NEW.clave, NEW.turno_id, NEW.valor, NEW.concepto,
        NEW.categoria_gasto_id, NEW.registrado_por, NEW.creado_en)
        IS DISTINCT FROM
       (OLD.id, OLD.clave, OLD.turno_id, OLD.valor, OLD.concepto,
        OLD.categoria_gasto_id, OLD.registrado_por, OLD.creado_en) THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: al eliminar solo cambia eliminado_en';
    END IF;

    -- Un Gasto_Sin_Turno se puede eliminar en cualquier momento
    IF OLD.turno_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM turnos WHERE id = OLD.turno_id AND cerrado_en IS NULL
    ) THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_gastos ON gastos;
CREATE TRIGGER trigger_proteger_gastos
    BEFORE UPDATE OR DELETE ON gastos
    FOR EACH ROW
    EXECUTE FUNCTION proteger_gastos();

-- --------------------------------------------
-- caja_mayor_movimientos
-- --------------------------------------------
CREATE OR REPLACE FUNCTION proteger_caja_mayor_movimientos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: los movimientos de caja mayor no cambian';
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_caja_mayor_movimientos ON caja_mayor_movimientos;
CREATE TRIGGER trigger_proteger_caja_mayor_movimientos
    BEFORE UPDATE OR DELETE ON caja_mayor_movimientos
    FOR EACH ROW
    EXECUTE FUNCTION proteger_caja_mayor_movimientos();

-- --------------------------------------------
-- gasto_origenes
-- --------------------------------------------
CREATE OR REPLACE FUNCTION proteger_gasto_origenes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: los orígenes de gasto no cambian';
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_gasto_origenes ON gasto_origenes;
CREATE TRIGGER trigger_proteger_gasto_origenes
    BEFORE UPDATE OR DELETE ON gasto_origenes
    FOR EACH ROW
    EXECUTE FUNCTION proteger_gasto_origenes();

-- --------------------------------------------
-- caja_mayor_saldos (solo se impide borrar)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION proteger_caja_mayor_saldos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: las partes de caja mayor no se borran';
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_caja_mayor_saldos ON caja_mayor_saldos;
CREATE TRIGGER trigger_proteger_caja_mayor_saldos
    BEFORE DELETE ON caja_mayor_saldos
    FOR EACH ROW
    EXECUTE FUNCTION proteger_caja_mayor_saldos();


-- ============================================
-- 5. SEGURIDAD
-- RLS activado con solo una política SELECT. Sin políticas de escritura,
-- la llave anon solo puede leer; las escrituras pasan por las RPC
-- SECURITY DEFINER (dueño postgres, no sujeto a RLS).
-- ============================================

ALTER TABLE caja_mayor_saldos ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_mayor_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasto_origenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caja_mayor_saldos_leer" ON caja_mayor_saldos;
CREATE POLICY "caja_mayor_saldos_leer" ON caja_mayor_saldos
    FOR SELECT TO anon, authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "caja_mayor_movimientos_leer" ON caja_mayor_movimientos;
CREATE POLICY "caja_mayor_movimientos_leer" ON caja_mayor_movimientos
    FOR SELECT TO anon, authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "gasto_origenes_leer" ON gasto_origenes;
CREATE POLICY "gasto_origenes_leer" ON gasto_origenes
    FOR SELECT TO anon, authenticated
    USING (TRUE);


-- ============================================
-- 6. FUNCIONES AUXILIARES, FÓRMULA DEL ESPERADO, APERTURA Y CIERRE
-- Mismas reglas que migration-ventas.sql: SECURITY DEFINER (dueño
-- postgres, no sujeto a RLS) con search_path fijo, errores de negocio con
-- RAISE EXCEPTION 'CODIGO', idempotencia por clave y bloqueos FOR UPDATE.
--
-- Orden de bloqueo (evita bloqueos cruzados):
--   1. la fila de turnos, si la operación tiene turno
--   2. la fila de gastos, si aplica
--   3. las Partes que se tocan, en orden de id
-- ============================================

-- --------------------------------------------
-- nombre_parte: 'Efectivo' para la Parte Efectivo o el nombre del método.
-- NULL si la Parte no existe. Interna.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION nombre_parte(p_parte UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
    SELECT CASE WHEN s.metodo_pago_id IS NULL THEN 'Efectivo' ELSE m.nombre::TEXT END
    FROM caja_mayor_saldos s
    LEFT JOIN metodos_pago m ON m.id = s.metodo_pago_id
    WHERE s.id = p_parte
$$;

-- --------------------------------------------
-- parte_efectivo: id de la Parte Efectivo (metodo_pago_id NULL). Interna.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION parte_efectivo()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
    SELECT id FROM caja_mayor_saldos WHERE metodo_pago_id IS NULL
$$;

-- --------------------------------------------
-- mover_caja_mayor: suma (valor > 0) o resta (valor < 0) a una Parte y
-- registra el Movimiento_Mayor con el saldo después. Devuelve el saldo.
-- Valor 0: no registra nada y devuelve el saldo actual.
-- Si el saldo quedaría < 0 → SALDO_INSUFICIENTE: <nombre de la Parte>.
-- Parte inexistente → DATOS_INVALIDOS.
-- Interna: solo la llaman las RPC (como dueño postgres). Quien llama ya
-- bloqueó las Partes en orden de id; el FOR UPDATE de aquí es un respaldo.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION mover_caja_mayor(
    p_parte UUID,
    p_valor BIGINT,
    p_tipo TEXT,
    p_persona TEXT,
    p_descripcion TEXT,
    p_turno UUID,
    p_gasto UUID,
    p_clave UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = public, extensions AS $$
DECLARE
    v_saldo BIGINT;
BEGIN
    IF p_parte IS NULL OR p_valor IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    SELECT saldo INTO v_saldo FROM caja_mayor_saldos WHERE id = p_parte FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    IF p_valor = 0 THEN
        RETURN v_saldo;
    END IF;

    IF v_saldo + p_valor < 0 THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: %', nombre_parte(p_parte);
    END IF;

    -- El CHECK caja_mayor_saldo_no_negativo sigue de respaldo
    BEGIN
        UPDATE caja_mayor_saldos
        SET saldo = saldo + p_valor,
            actualizado_en = NOW()
        WHERE id = p_parte
        RETURNING saldo INTO v_saldo;
    EXCEPTION WHEN check_violation THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: %', nombre_parte(p_parte);
    END;

    INSERT INTO caja_mayor_movimientos (clave, parte_id, tipo, valor, saldo_despues,
                                        persona, descripcion, turno_id, gasto_id)
    VALUES (p_clave, p_parte, p_tipo, p_valor, v_saldo,
            NULLIF(trim(p_persona), ''), NULLIF(trim(p_descripcion), ''), p_turno, p_gasto);

    RETURN v_saldo;
END;
$$;

-- --------------------------------------------
-- base_proximo_turno: base_siguiente del último turno cerrado (por
-- cerrado_en). Si es nula o no hay turnos cerrados, base_caja_defecto
-- cuando es un entero de 1 a 8 dígitos; si no, 0. Pública (AbrirTurno).
-- --------------------------------------------
CREATE OR REPLACE FUNCTION base_proximo_turno()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_base INTEGER;
    v_defecto TEXT;
BEGIN
    SELECT base_siguiente INTO v_base
    FROM turnos
    WHERE cerrado_en IS NOT NULL
    ORDER BY cerrado_en DESC, id DESC
    LIMIT 1;

    IF v_base IS NOT NULL THEN
        RETURN v_base;
    END IF;

    SELECT trim(valor::TEXT) INTO v_defecto
    FROM configuracion
    WHERE clave = 'base_caja_defecto';

    IF v_defecto ~ '^[0-9]{1,8}$' THEN
        RETURN v_defecto::INTEGER;
    END IF;

    RETURN 0;
END;
$$;

-- --------------------------------------------
-- efectivo_esperado_turno (reemplaza la de migration-ventas.sql)
--   base + ventas registradas en efectivo
--   − Parte_Cajon de gastos no eliminados (gasto sin orígenes = valor completo)
--   − retiros del turno
-- NULL si el turno no existe.
-- --------------------------------------------
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
BEGIN
    SELECT base INTO v_base FROM turnos WHERE id = p_turno;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(sum(total), 0) INTO v_ventas
    FROM ventas
    WHERE turno_id = p_turno AND estado = 'registrada' AND es_efectivo;

    -- Parte_Cajon = valor − lo que sale de Partes de la Caja mayor
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

    RETURN (v_base + v_ventas - v_gastos - v_retiros)::INTEGER;
END;
$$;

-- --------------------------------------------
-- resumen_turno (reemplaza la de migration-ventas.sql; misma firma)
--   { turno: { id, abierto_por, abierto_en, base }, base,
--     por_metodo: [{ metodo_pago_id, nombre, es_efectivo, total, cantidad }],
--     total_ventas, total_gastos, total_retiros, efectivo_esperado }
-- total_gastos es el valor completo de los gastos no eliminados (todas las
-- fuentes); los retiros no cuentan como gastos.
-- Turno inexistente → TURNO_NO_ABIERTO
-- --------------------------------------------
CREATE OR REPLACE FUNCTION resumen_turno(p_turno UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_t turnos%ROWTYPE;
    v_por_metodo jsonb;
    v_total_ventas BIGINT;
    v_total_gastos BIGINT;
    v_total_retiros BIGINT;
BEGIN
    SELECT * INTO v_t FROM turnos WHERE id = p_turno;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TURNO_NO_ABIERTO';
    END IF;

    -- Se agrupa también por es_efectivo (copiado en cada venta) para que
    -- las filas de efectivo sumen lo mismo que el Efectivo_Esperado.
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'metodo_pago_id', x.metodo_pago_id,
                'nombre', x.nombre,
                'es_efectivo', x.es_efectivo,
                'total', x.total,
                'cantidad', x.cantidad
            )
            ORDER BY x.orden, x.nombre, x.es_efectivo DESC
        ),
        '[]'::jsonb
    )
    INTO v_por_metodo
    FROM (
        SELECT v.metodo_pago_id, m.nombre, m.orden, v.es_efectivo,
               sum(v.total) AS total, count(*) AS cantidad
        FROM ventas v
        JOIN metodos_pago m ON m.id = v.metodo_pago_id
        WHERE v.turno_id = p_turno AND v.estado = 'registrada'
        GROUP BY v.metodo_pago_id, m.nombre, m.orden, v.es_efectivo
    ) x;

    SELECT COALESCE(sum(total), 0) INTO v_total_ventas
    FROM ventas
    WHERE turno_id = p_turno AND estado = 'registrada';

    SELECT COALESCE(sum(valor), 0) INTO v_total_gastos
    FROM gastos
    WHERE turno_id = p_turno AND eliminado_en IS NULL;

    SELECT COALESCE(sum(valor), 0) INTO v_total_retiros
    FROM caja_mayor_movimientos
    WHERE turno_id = p_turno AND tipo = 'retiro';

    RETURN jsonb_build_object(
        'turno', jsonb_build_object(
            'id', v_t.id,
            'abierto_por', v_t.abierto_por,
            'abierto_en', v_t.abierto_en,
            'base', v_t.base
        ),
        'base', v_t.base,
        'por_metodo', v_por_metodo,
        'total_ventas', v_total_ventas,
        'total_gastos', v_total_gastos,
        'total_retiros', v_total_retiros,
        'efectivo_esperado', efectivo_esperado_turno(p_turno)
    );
END;
$$;

-- --------------------------------------------
-- abrir_turno (firma nueva: la base la pone el servidor)
--   { resultado: 'abierto' | 'existente', turno: { id, abierto_por, abierto_en, base } }
-- base = base_proximo_turno()
-- --------------------------------------------
DROP FUNCTION IF EXISTS abrir_turno(UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION abrir_turno(p_clave UUID, p_persona TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_t turnos%ROWTYPE;
    v_resultado TEXT;
BEGIN
    -- 1. Validación
    IF p_clave IS NULL
        OR p_persona IS NULL OR length(trim(p_persona)) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 2. Reintento: la clave ya abrió un turno
    SELECT * INTO v_t FROM turnos WHERE clave_apertura = p_clave;
    IF FOUND THEN
        v_resultado := 'abierto';
    ELSE
        -- 3. Ya hay un turno abierto
        SELECT * INTO v_t FROM turnos WHERE cerrado_en IS NULL LIMIT 1;
        IF FOUND THEN
            v_resultado := 'existente';
        ELSE
            -- 4. Apertura. Otra apertura simultánea choca con turnos_un_abierto
            --    (o con clave_apertura si es el mismo reintento).
            BEGIN
                INSERT INTO turnos (clave_apertura, abierto_por, base)
                VALUES (p_clave, trim(p_persona), base_proximo_turno())
                RETURNING * INTO v_t;
                v_resultado := 'abierto';
            EXCEPTION WHEN unique_violation THEN
                SELECT * INTO v_t FROM turnos WHERE clave_apertura = p_clave;
                IF FOUND THEN
                    v_resultado := 'abierto';
                ELSE
                    SELECT * INTO v_t FROM turnos WHERE cerrado_en IS NULL LIMIT 1;
                    IF NOT FOUND THEN
                        RAISE;
                    END IF;
                    v_resultado := 'existente';
                END IF;
            END;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'resultado', v_resultado,
        'turno', jsonb_build_object(
            'id', v_t.id,
            'abierto_por', v_t.abierto_por,
            'abierto_en', v_t.abierto_en,
            'base', v_t.base
        )
    );
END;
$$;

-- --------------------------------------------
-- cerrar_turno (firma nueva; cierre a ciegas; el primer cierre gana)
--   { resultado: 'cerrado',
--     cierre: { cerrado_en, cerrado_por, base_siguiente, enviado_mayor } }
--   { resultado: 'ya_cerrado', cerrado_por, cerrado_en }
-- No devuelve esperado ni diferencia (se guardan en el turno).
-- En la misma transacción:
--   - enviado_mayor = contado − base_siguiente pasa a la Parte Efectivo
--   - el total de ventas registradas no efectivo de cada método pasa a su Parte
--   (movimientos 'cierre_turno'; los de $ 0 no se registran)
-- Reintento con la misma clave: respuesta original, sin movimientos nuevos.
-- Turno inexistente → TURNO_NO_ABIERTO
-- --------------------------------------------
DROP FUNCTION IF EXISTS cerrar_turno(UUID, UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION cerrar_turno(
    p_turno UUID,
    p_clave UUID,
    p_persona TEXT,
    p_contado INTEGER,
    p_base_siguiente INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_t turnos%ROWTYPE;
    v_esperado INTEGER;
    v_efectivo UUID;
    r RECORD;
BEGIN
    -- 1. Turno bloqueado hasta el final de la transacción
    SELECT * INTO v_t FROM turnos WHERE id = p_turno FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TURNO_NO_ABIERTO';
    END IF;

    -- Turno ya cerrado: no se modifica (proteger_turnos lo impediría)
    IF v_t.cerrado_en IS NOT NULL THEN
        IF v_t.clave_cierre = p_clave THEN
            RETURN jsonb_build_object(
                'resultado', 'cerrado',
                'cierre', jsonb_build_object(
                    'cerrado_en', v_t.cerrado_en,
                    'cerrado_por', v_t.cerrado_por,
                    'base_siguiente', v_t.base_siguiente,
                    'enviado_mayor', v_t.enviado_mayor
                )
            );
        END IF;
        RETURN jsonb_build_object(
            'resultado', 'ya_cerrado',
            'cerrado_por', v_t.cerrado_por,
            'cerrado_en', v_t.cerrado_en
        );
    END IF;

    -- 2. Validación
    IF p_clave IS NULL
        OR p_persona IS NULL OR length(trim(p_persona)) NOT BETWEEN 1 AND 60
        OR p_contado IS NULL OR p_contado NOT BETWEEN 0 AND 99999999
        OR p_base_siguiente IS NULL OR p_base_siguiente NOT BETWEEN 0 AND p_contado THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- Una clave de cierre usada en otro turno
    IF EXISTS (SELECT 1 FROM turnos WHERE clave_cierre = p_clave) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 3. Con el bloqueo tomado, incluye todo lo confirmado antes
    v_esperado := efectivo_esperado_turno(p_turno);

    UPDATE turnos
    SET cerrado_en = NOW(),
        cerrado_por = trim(p_persona),
        clave_cierre = p_clave,
        efectivo_contado = p_contado,
        efectivo_esperado = v_esperado,
        diferencia = p_contado - v_esperado,
        base_siguiente = p_base_siguiente,
        enviado_mayor = p_contado - p_base_siguiente
    WHERE id = p_turno
    RETURNING * INTO v_t;

    -- 4. Partes de los métodos con ventas no efectivo (por si faltan) y
    --    bloqueo de las Partes involucradas en orden de id
    INSERT INTO caja_mayor_saldos (metodo_pago_id)
    SELECT DISTINCT v.metodo_pago_id
    FROM ventas v
    WHERE v.turno_id = p_turno AND v.estado = 'registrada' AND NOT v.es_efectivo
    ON CONFLICT (metodo_pago_id) DO NOTHING;

    v_efectivo := parte_efectivo();
    IF v_efectivo IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    PERFORM 1
    FROM caja_mayor_saldos s
    WHERE (s.id = v_efectivo AND v_t.enviado_mayor > 0)
       OR s.metodo_pago_id IN (
            SELECT v.metodo_pago_id
            FROM ventas v
            WHERE v.turno_id = p_turno AND v.estado = 'registrada' AND NOT v.es_efectivo
       )
    ORDER BY s.id
    FOR UPDATE OF s;

    -- 5. Efectivo enviado a la Parte Efectivo (0 no se registra)
    PERFORM mover_caja_mayor(
        v_efectivo, v_t.enviado_mayor::BIGINT, 'cierre_turno', v_t.cerrado_por,
        'Cierre de turno: efectivo', p_turno, NULL, NULL
    );

    -- 6. Ventas no efectivo de cada método a su Parte (0 no se registra)
    FOR r IN
        SELECT s.id AS parte_id, m.nombre, sum(v.total) AS total
        FROM ventas v
        JOIN caja_mayor_saldos s ON s.metodo_pago_id = v.metodo_pago_id
        JOIN metodos_pago m ON m.id = v.metodo_pago_id
        WHERE v.turno_id = p_turno AND v.estado = 'registrada' AND NOT v.es_efectivo
        GROUP BY s.id, m.nombre
        ORDER BY s.id
    LOOP
        PERFORM mover_caja_mayor(
            r.parte_id, r.total::BIGINT, 'cierre_turno', v_t.cerrado_por,
            left('Cierre de turno: ventas ' || r.nombre, 200), p_turno, NULL, NULL
        );
    END LOOP;

    RETURN jsonb_build_object(
        'resultado', 'cerrado',
        'cierre', jsonb_build_object(
            'cerrado_en', v_t.cerrado_en,
            'cerrado_por', v_t.cerrado_por,
            'base_siguiente', v_t.base_siguiente,
            'enviado_mayor', v_t.enviado_mayor
        )
    );
END;
$$;

-- --------------------------------------------
-- Permisos
-- Internas: sin EXECUTE para PUBLIC, anon ni authenticated (Supabase da
-- EXECUTE a anon por privilegios por defecto, por eso se revoca también
-- a esos roles). Las RPC públicas las llaman como dueño postgres.
-- Públicas: solo anon y authenticated.
-- --------------------------------------------
REVOKE ALL ON FUNCTION mover_caja_mayor(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nombre_parte(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION parte_efectivo() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION base_proximo_turno() FROM PUBLIC;
REVOKE ALL ON FUNCTION efectivo_esperado_turno(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION resumen_turno(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION abrir_turno(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION cerrar_turno(UUID, UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION base_proximo_turno() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION efectivo_esperado_turno(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resumen_turno(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION abrir_turno(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cerrar_turno(UUID, UUID, TEXT, INTEGER, INTEGER) TO anon, authenticated;


-- ============================================
-- 7. GASTOS CON ORIGEN, RETIROS Y RPC DE CAJA MAYOR
-- Mismas reglas que la sección 6 (SECURITY DEFINER, search_path fijo,
-- errores con RAISE EXCEPTION 'CODIGO', idempotencia por clave).
-- Orden de bloqueo: turno → gasto → Partes en orden de id.
--
-- Orígenes de gasto (p_origenes y respuestas):
--   entrada:   [{ parte_id: UUID | null, valor: entero }]   null = Cajón
--   respuesta: [{ parte_id: UUID | null, nombre, valor }]    nombre 'Cajón'
--              para parte_id null; [] en gastos anteriores a esta
--              migración (100 % Cajón).
-- ============================================

-- --------------------------------------------
-- origenes_gasto: orígenes de un gasto como jsonb. Interna.
--   [{ parte_id, nombre, valor }]  Cajón primero, luego Efectivo y los
--   métodos por metodos_pago.orden. [] si el gasto no tiene orígenes.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION origenes_gasto(p_gasto UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'parte_id', o.parte_id,
                'nombre', CASE
                    WHEN o.parte_id IS NULL THEN 'Cajón'
                    WHEN s.metodo_pago_id IS NULL THEN 'Efectivo'
                    ELSE m.nombre::TEXT
                END,
                'valor', o.valor
            )
            ORDER BY (o.parte_id IS NOT NULL), (s.metodo_pago_id IS NOT NULL),
                     m.orden, m.nombre, o.parte_id
        ),
        '[]'::jsonb
    )
    FROM gasto_origenes o
    LEFT JOIN caja_mayor_saldos s ON s.id = o.parte_id
    LEFT JOIN metodos_pago m ON m.id = s.metodo_pago_id
    WHERE o.gasto_id = p_gasto
$$;

-- --------------------------------------------
-- movimiento_mayor_json: un Movimiento_Mayor con el formato de
-- movimientos_caja_mayor. NULL si no existe. Interna.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION movimiento_mayor_json(p_movimiento UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
    SELECT jsonb_build_object(
        'id', mv.id,
        'creado_en', mv.creado_en,
        'tipo', mv.tipo,
        'parte_id', mv.parte_id,
        'parte_nombre', nombre_parte(mv.parte_id),
        'valor', mv.valor,
        'saldo_despues', mv.saldo_despues,
        'persona', mv.persona,
        'descripcion', mv.descripcion,
        'turno_id', mv.turno_id,
        'gasto_id', mv.gasto_id,
        'gasto_eliminado', COALESCE(g.eliminado_en IS NOT NULL, FALSE)
    )
    FROM caja_mayor_movimientos mv
    LEFT JOIN gastos g ON g.id = mv.gasto_id
    WHERE mv.id = p_movimiento
$$;

-- --------------------------------------------
-- registrar_gasto (firma nueva: p_turno opcional y p_origenes)
--   → { id, turno_id, valor, concepto, categoria_gasto_id, registrado_por,
--       creado_en, origenes: [{ parte_id, nombre, valor }] }
-- p_turno NULL = Gasto_Sin_Turno (desde Reportes): solo Partes.
-- p_origenes NULL o [] con turno = 100 % Cajón; sin turno → ORIGEN_INVALIDO.
-- Orígenes: cada valor entero 1..10.000.000, parte_id nulo (Cajón) o de
-- una Parte existente, sin fuentes repetidas, suma = p_valor y sin Cajón
-- cuando no hay turno; si no → ORIGEN_INVALIDO.
-- Cada Parte se resta con un movimiento 'gasto'; si no alcanza →
-- SALDO_INSUFICIENTE: <Parte> y no se registra nada.
-- Turno inexistente o cerrado → TURNO_CERRADO.
-- Reintento con la misma clave: el gasto original con sus orígenes.
-- No bloquea si la Parte_Cajon supera el efectivo esperado: esa
-- advertencia es de la UI.
-- --------------------------------------------
DROP FUNCTION IF EXISTS registrar_gasto(UUID, UUID, INTEGER, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION registrar_gasto(
    p_clave UUID,
    p_turno UUID,
    p_valor INTEGER,
    p_concepto TEXT,
    p_categoria UUID,
    p_persona TEXT,
    p_origenes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_gasto gastos%ROWTYPE;
    v_cerrado_en TIMESTAMP WITH TIME ZONE;
    v_origenes jsonb;
    v_elem jsonb;
    v_parte UUID;
    v_num NUMERIC;
    v_suma BIGINT := 0;
    v_cajon INTEGER;
    v_partes UUID[] := ARRAY[]::UUID[];
    v_valores INTEGER[] := ARRAY[]::INTEGER[];
    r RECORD;
BEGIN
    IF p_clave IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 1. Reintento: el gasto ya se registró
    SELECT * INTO v_gasto FROM gastos WHERE clave = p_clave;

    IF NOT FOUND THEN
        -- 2. Turno bloqueado (si hay)
        IF p_turno IS NOT NULL THEN
            SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = p_turno FOR UPDATE;
            IF NOT FOUND OR v_cerrado_en IS NOT NULL THEN
                RAISE EXCEPTION 'TURNO_CERRADO';
            END IF;

            -- Otro reintento simultáneo pudo registrarlo mientras se esperaba el bloqueo
            SELECT * INTO v_gasto FROM gastos WHERE clave = p_clave;
        END IF;
    END IF;

    IF NOT FOUND THEN
        -- 3. Datos del gasto
        IF p_valor IS NULL OR p_valor NOT BETWEEN 1 AND 10000000
            OR p_concepto IS NULL OR length(trim(p_concepto)) NOT BETWEEN 1 AND 120
            OR p_persona IS NULL OR length(trim(p_persona)) NOT BETWEEN 1 AND 60
            OR NOT EXISTS (
                SELECT 1 FROM categorias_gasto WHERE id = p_categoria AND activo
            ) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- 4. Orígenes: sin orígenes con turno = 100 % Cajón
        IF p_origenes IS NULL OR jsonb_typeof(p_origenes) = 'null'
            OR p_origenes = '[]'::jsonb THEN
            IF p_turno IS NULL THEN
                RAISE EXCEPTION 'ORIGEN_INVALIDO';
            END IF;
            v_origenes := jsonb_build_array(
                jsonb_build_object('parte_id', NULL, 'valor', p_valor)
            );
        ELSE
            v_origenes := p_origenes;
        END IF;

        IF jsonb_typeof(v_origenes) <> 'array' THEN
            RAISE EXCEPTION 'ORIGEN_INVALIDO';
        END IF;

        FOR v_elem IN SELECT value FROM jsonb_array_elements(v_origenes) LOOP
            IF jsonb_typeof(v_elem) IS DISTINCT FROM 'object' THEN
                RAISE EXCEPTION 'ORIGEN_INVALIDO';
            END IF;

            -- parte_id: ausente o null = Cajón; si no, UUID de una Parte existente
            IF jsonb_typeof(v_elem -> 'parte_id') IS NULL
                OR jsonb_typeof(v_elem -> 'parte_id') = 'null' THEN
                v_parte := NULL;
            ELSIF jsonb_typeof(v_elem -> 'parte_id') = 'string'
                AND (v_elem ->> 'parte_id')
                    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                v_parte := (v_elem ->> 'parte_id')::UUID;
                IF NOT EXISTS (SELECT 1 FROM caja_mayor_saldos WHERE id = v_parte) THEN
                    RAISE EXCEPTION 'ORIGEN_INVALIDO';
                END IF;
            ELSE
                RAISE EXCEPTION 'ORIGEN_INVALIDO';
            END IF;

            -- valor: número entero 1..10.000.000
            IF jsonb_typeof(v_elem -> 'valor') IS DISTINCT FROM 'number' THEN
                RAISE EXCEPTION 'ORIGEN_INVALIDO';
            END IF;
            v_num := (v_elem ->> 'valor')::NUMERIC;
            IF v_num <> trunc(v_num) OR v_num NOT BETWEEN 1 AND 10000000 THEN
                RAISE EXCEPTION 'ORIGEN_INVALIDO';
            END IF;

            IF v_parte IS NULL THEN
                -- Cajón: solo con turno y una vez
                IF p_turno IS NULL OR v_cajon IS NOT NULL THEN
                    RAISE EXCEPTION 'ORIGEN_INVALIDO';
                END IF;
                v_cajon := v_num::INTEGER;
            ELSE
                IF v_parte = ANY (v_partes) THEN
                    RAISE EXCEPTION 'ORIGEN_INVALIDO';
                END IF;
                v_partes := v_partes || v_parte;
                v_valores := v_valores || v_num::INTEGER;
            END IF;

            v_suma := v_suma + v_num::BIGINT;
        END LOOP;

        IF v_cajon IS NULL AND cardinality(v_partes) = 0 THEN
            RAISE EXCEPTION 'ORIGEN_INVALIDO';
        END IF;

        IF v_suma <> p_valor THEN
            RAISE EXCEPTION 'ORIGEN_INVALIDO';
        END IF;

        -- 5. Partes bloqueadas en orden de id
        PERFORM 1
        FROM caja_mayor_saldos
        WHERE id = ANY (v_partes)
        ORDER BY id
        FOR UPDATE;

        -- Sin turno no hay bloqueo de turno: un reintento simultáneo con la
        -- misma clave choca con gastos.clave UNIQUE y devuelve el original.
        BEGIN
            INSERT INTO gastos (clave, turno_id, valor, concepto, categoria_gasto_id, registrado_por)
            VALUES (p_clave, p_turno, p_valor, trim(p_concepto), p_categoria, trim(p_persona))
            RETURNING * INTO v_gasto;
        EXCEPTION WHEN unique_violation THEN
            SELECT * INTO v_gasto FROM gastos WHERE clave = p_clave;
            IF NOT FOUND THEN
                RAISE;
            END IF;
            RETURN jsonb_build_object(
                'id', v_gasto.id,
                'turno_id', v_gasto.turno_id,
                'valor', v_gasto.valor,
                'concepto', v_gasto.concepto,
                'categoria_gasto_id', v_gasto.categoria_gasto_id,
                'registrado_por', v_gasto.registrado_por,
                'creado_en', v_gasto.creado_en,
                'origenes', origenes_gasto(v_gasto.id)
            );
        END;

        IF v_cajon IS NOT NULL THEN
            INSERT INTO gasto_origenes (gasto_id, parte_id, valor)
            VALUES (v_gasto.id, NULL, v_cajon);
        END IF;

        FOR r IN
            SELECT x.parte_id, x.valor
            FROM unnest(v_partes, v_valores) AS x(parte_id, valor)
            ORDER BY x.parte_id
        LOOP
            INSERT INTO gasto_origenes (gasto_id, parte_id, valor)
            VALUES (v_gasto.id, r.parte_id, r.valor);

            PERFORM mover_caja_mayor(
                r.parte_id, -r.valor::BIGINT, 'gasto', v_gasto.registrado_por,
                v_gasto.concepto, p_turno, v_gasto.id, NULL
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'id', v_gasto.id,
        'turno_id', v_gasto.turno_id,
        'valor', v_gasto.valor,
        'concepto', v_gasto.concepto,
        'categoria_gasto_id', v_gasto.categoria_gasto_id,
        'registrado_por', v_gasto.registrado_por,
        'creado_en', v_gasto.creado_en,
        'origenes', origenes_gasto(v_gasto.id)
    );
END;
$$;

-- --------------------------------------------
-- eliminar_gasto (reemplaza la de migration-ventas.sql; misma firma)
-- Marca eliminado_en y devuelve a cada Parte de sus orígenes su valor
-- con un movimiento 'eliminacion_gasto'. Lo del Cajón vuelve solo al
-- esperado del turno (deja de restarse).
-- Ya eliminado → termina sin cambios (reintento), aunque el turno esté cerrado.
-- Con turno cerrado → TURNO_CERRADO. Un Gasto_Sin_Turno se elimina siempre.
-- Gasto inexistente → GASTO_NO_EXISTE
-- --------------------------------------------
CREATE OR REPLACE FUNCTION eliminar_gasto(p_gasto UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_turno UUID;
    v_cerrado_en TIMESTAMP WITH TIME ZONE;
    v_g gastos%ROWTYPE;
    r RECORD;
BEGIN
    SELECT turno_id INTO v_turno FROM gastos WHERE id = p_gasto;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'GASTO_NO_EXISTE';
    END IF;

    -- 1. Turno (si hay), 2. gasto, 3. Partes en orden de id
    IF v_turno IS NOT NULL THEN
        SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = v_turno FOR UPDATE;
    END IF;

    SELECT * INTO v_g FROM gastos WHERE id = p_gasto FOR UPDATE;

    IF v_g.eliminado_en IS NOT NULL THEN
        RETURN;
    END IF;

    IF v_turno IS NOT NULL AND v_cerrado_en IS NOT NULL THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    PERFORM 1
    FROM caja_mayor_saldos
    WHERE id IN (
        SELECT parte_id FROM gasto_origenes
        WHERE gasto_id = p_gasto AND parte_id IS NOT NULL
    )
    ORDER BY id
    FOR UPDATE;

    UPDATE gastos SET eliminado_en = NOW() WHERE id = p_gasto;

    FOR r IN
        SELECT parte_id, valor
        FROM gasto_origenes
        WHERE gasto_id = p_gasto AND parte_id IS NOT NULL
        ORDER BY parte_id
    LOOP
        PERFORM mover_caja_mayor(
            r.parte_id, r.valor::BIGINT, 'eliminacion_gasto', NULL,
            left('Gasto eliminado: ' || v_g.concepto, 200), v_turno, p_gasto, NULL
        );
    END LOOP;
END;
$$;

-- --------------------------------------------
-- registrar_retiro: efectivo del cajón del turno abierto a la Parte Efectivo
--   → { id, creado_en, tipo: 'retiro', parte_id, parte_nombre, valor,
--       saldo_despues, persona, descripcion, turno_id, gasto_id: null,
--       gasto_eliminado: false }
-- descripcion = nota (null si está vacía). Valor 1..10.000.000, persona
-- 1..60, nota ≤ 120; si no → DATOS_INVALIDOS. Clave usada por otro tipo de
-- movimiento → DATOS_INVALIDOS.
-- Turno inexistente o cerrado → TURNO_CERRADO.
-- Reintento con la misma clave: el retiro original.
-- No bloquea si supera el efectivo esperado: esa advertencia es de la UI.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION registrar_retiro(
    p_clave UUID,
    p_turno UUID,
    p_valor INTEGER,
    p_persona TEXT,
    p_nota TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_id UUID;
    v_tipo TEXT;
    v_cerrado_en TIMESTAMP WITH TIME ZONE;
    v_efectivo UUID;
BEGIN
    IF p_clave IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- Reintento
    SELECT id, tipo INTO v_id, v_tipo FROM caja_mayor_movimientos WHERE clave = p_clave;
    IF FOUND THEN
        IF v_tipo <> 'retiro' THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;
        RETURN movimiento_mayor_json(v_id);
    END IF;

    SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = p_turno FOR UPDATE;
    IF NOT FOUND OR v_cerrado_en IS NOT NULL THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    -- Otro reintento simultáneo pudo registrarlo mientras se esperaba el bloqueo
    SELECT id, tipo INTO v_id, v_tipo FROM caja_mayor_movimientos WHERE clave = p_clave;
    IF FOUND THEN
        IF v_tipo <> 'retiro' THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;
        RETURN movimiento_mayor_json(v_id);
    END IF;

    IF p_valor IS NULL OR p_valor NOT BETWEEN 1 AND 10000000
        OR p_persona IS NULL OR length(trim(p_persona)) NOT BETWEEN 1 AND 60
        OR (p_nota IS NOT NULL AND length(trim(p_nota)) > 120) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    v_efectivo := parte_efectivo();
    IF v_efectivo IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    PERFORM mover_caja_mayor(
        v_efectivo, p_valor::BIGINT, 'retiro', trim(p_persona),
        p_nota, p_turno, NULL, p_clave
    );

    SELECT id INTO v_id FROM caja_mayor_movimientos WHERE clave = p_clave;
    RETURN movimiento_mayor_json(v_id);
END;
$$;

-- --------------------------------------------
-- saldos_caja_mayor
--   [{ parte_id, metodo_pago_id, nombre, activo, saldo }]
-- Efectivo primero (metodo_pago_id null, activo true) y luego los métodos
-- por metodos_pago.orden y nombre. Incluye Partes de métodos inactivos.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION saldos_caja_mayor()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'parte_id', s.id,
                'metodo_pago_id', s.metodo_pago_id,
                'nombre', CASE WHEN s.metodo_pago_id IS NULL THEN 'Efectivo' ELSE m.nombre::TEXT END,
                'activo', COALESCE(m.activo, TRUE),
                'saldo', s.saldo
            )
            ORDER BY (s.metodo_pago_id IS NOT NULL), m.orden, m.nombre, s.id
        ),
        '[]'::jsonb
    )
    FROM caja_mayor_saldos s
    LEFT JOIN metodos_pago m ON m.id = s.metodo_pago_id
$$;

-- --------------------------------------------
-- movimientos_caja_mayor(p_desde, p_hasta)
--   [{ id, creado_en, tipo, parte_id, parte_nombre, valor, saldo_despues,
--      persona, descripcion, turno_id, gasto_id, gasto_eliminado }]
-- Más reciente primero (creado_en DESC, id DESC). Mismo rango que
-- reporte_rango: [p_desde 00:00, p_hasta + 1 00:00) en America/Bogota;
-- nulos, p_desde > p_hasta o más de 366 días → RANGO_INVALIDO.
-- gasto_eliminado: el gasto relacionado ya está eliminado (false sin gasto).
-- --------------------------------------------
CREATE OR REPLACE FUNCTION movimientos_caja_mayor(p_desde DATE, p_hasta DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_inicio TIMESTAMP WITH TIME ZONE;
    v_fin TIMESTAMP WITH TIME ZONE;
    v_movimientos jsonb;
BEGIN
    IF p_desde IS NULL OR p_hasta IS NULL
        OR p_desde > p_hasta
        OR (p_hasta - p_desde) + 1 > 366 THEN
        RAISE EXCEPTION 'RANGO_INVALIDO';
    END IF;

    v_inicio := p_desde::timestamp AT TIME ZONE 'America/Bogota';
    v_fin := (p_hasta + 1)::timestamp AT TIME ZONE 'America/Bogota';

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', mv.id,
                'creado_en', mv.creado_en,
                'tipo', mv.tipo,
                'parte_id', mv.parte_id,
                'parte_nombre', CASE WHEN s.metodo_pago_id IS NULL THEN 'Efectivo' ELSE m.nombre::TEXT END,
                'valor', mv.valor,
                'saldo_despues', mv.saldo_despues,
                'persona', mv.persona,
                'descripcion', mv.descripcion,
                'turno_id', mv.turno_id,
                'gasto_id', mv.gasto_id,
                'gasto_eliminado', COALESCE(g.eliminado_en IS NOT NULL, FALSE)
            )
            ORDER BY mv.creado_en DESC, mv.id DESC
        ),
        '[]'::jsonb
    )
    INTO v_movimientos
    FROM caja_mayor_movimientos mv
    JOIN caja_mayor_saldos s ON s.id = mv.parte_id
    LEFT JOIN metodos_pago m ON m.id = s.metodo_pago_id
    LEFT JOIN gastos g ON g.id = mv.gasto_id
    WHERE mv.creado_en >= v_inicio AND mv.creado_en < v_fin;

    RETURN v_movimientos;
END;
$$;

-- --------------------------------------------
-- ajustar_caja_mayor: suma (valor > 0) o resta (valor < 0) a una Parte
--   → el movimiento creado, mismo formato que registrar_retiro (tipo 'ajuste',
--     descripcion = motivo, turno_id y gasto_id null)
-- valor ≠ 0 y |valor| ≤ 99.999.999, motivo 3..200, persona 1..60, Parte
-- existente; si no → DATOS_INVALIDOS. Clave usada por otro tipo de
-- movimiento → DATOS_INVALIDOS.
-- Saldo que quedaría < 0 → SALDO_INSUFICIENTE: <Parte>.
-- Reintento con la misma clave: el ajuste original sin aplicarlo otra vez.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION ajustar_caja_mayor(
    p_clave UUID,
    p_parte UUID,
    p_valor INTEGER,
    p_motivo TEXT,
    p_persona TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_id UUID;
    v_tipo TEXT;
BEGIN
    IF p_clave IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- Reintento
    SELECT id, tipo INTO v_id, v_tipo FROM caja_mayor_movimientos WHERE clave = p_clave;
    IF FOUND THEN
        IF v_tipo <> 'ajuste' THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;
        RETURN movimiento_mayor_json(v_id);
    END IF;

    IF p_parte IS NULL
        OR p_valor IS NULL OR p_valor = 0 OR abs(p_valor) > 99999999
        OR p_motivo IS NULL OR length(trim(p_motivo)) NOT BETWEEN 3 AND 200
        OR p_persona IS NULL OR length(trim(p_persona)) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    PERFORM 1 FROM caja_mayor_saldos WHERE id = p_parte FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- Otro reintento simultáneo pudo aplicarlo mientras se esperaba el bloqueo
    SELECT id, tipo INTO v_id, v_tipo FROM caja_mayor_movimientos WHERE clave = p_clave;
    IF FOUND THEN
        IF v_tipo <> 'ajuste' THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;
        RETURN movimiento_mayor_json(v_id);
    END IF;

    PERFORM mover_caja_mayor(
        p_parte, p_valor::BIGINT, 'ajuste', trim(p_persona),
        trim(p_motivo), NULL, NULL, p_clave
    );

    SELECT id INTO v_id FROM caja_mayor_movimientos WHERE clave = p_clave;
    RETURN movimiento_mayor_json(v_id);
END;
$$;

-- --------------------------------------------
-- reporte_rango (reemplaza la de migration-ventas.sql; misma firma)
-- p_desde/p_hasta nulos, p_desde > p_hasta o más de 366 días → RANGO_INVALIDO
--   { ventas:    [{ id, creado_en, total, metodo_pago_id, efectivo_recibido, cambio,
--                   estado, anulada_en, anulada_por, motivo_anulacion, turno_id }]
--                 todas las del rango, incluidas anuladas
--     productos: [{ producto_id, nombre, cantidad, valor }]
--                 detalles de ventas registradas del rango, agrupados por producto
--     gastos:    [{ id, creado_en, valor, concepto, categoria_gasto_id, registrado_por,
--                   turno_id, origenes: [{ parte_id, nombre, valor }] }]
--                 no eliminados del rango, con y sin turno; origenes [] = 100 % Cajón
--     turnos:    [{ id, abierto_por, abierto_en, cerrado_por, cerrado_en, base,
--                   efectivo_contado, efectivo_esperado, diferencia,
--                   por_metodo: [{ metodo_pago_id, total }], total_gastos,
--                   total_retiros, base_siguiente, enviado_mayor }]
--                 abiertos en el rango; por_metodo, total_gastos y total_retiros
--                 cubren todo el turno; total_gastos es el valor completo de los
--                 gastos no eliminados (no incluye retiros); para turnos abiertos
--                 efectivo_esperado se calcula al momento; base_siguiente y
--                 enviado_mayor son null en abiertos y en cerrados antiguos
--     metodos:          [{ id, nombre, es_efectivo, activo }]  todos
--     categorias_gasto: [{ id, nombre, activo }]               todas }
-- --------------------------------------------
CREATE OR REPLACE FUNCTION reporte_rango(p_desde DATE, p_hasta DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_inicio TIMESTAMP WITH TIME ZONE;
    v_fin TIMESTAMP WITH TIME ZONE;
    v_ventas jsonb;
    v_productos jsonb;
    v_gastos jsonb;
    v_turnos jsonb;
    v_metodos jsonb;
    v_categorias jsonb;
BEGIN
    IF p_desde IS NULL OR p_hasta IS NULL
        OR p_desde > p_hasta
        OR (p_hasta - p_desde) + 1 > 366 THEN
        RAISE EXCEPTION 'RANGO_INVALIDO';
    END IF;

    v_inicio := p_desde::timestamp AT TIME ZONE 'America/Bogota';
    v_fin := (p_hasta + 1)::timestamp AT TIME ZONE 'America/Bogota';

    -- Ventas del rango, incluidas anuladas
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', v.id,
                'creado_en', v.creado_en,
                'total', v.total,
                'metodo_pago_id', v.metodo_pago_id,
                'efectivo_recibido', v.efectivo_recibido,
                'cambio', v.cambio,
                'estado', v.estado,
                'anulada_en', v.anulada_en,
                'anulada_por', v.anulada_por,
                'motivo_anulacion', v.motivo_anulacion,
                'turno_id', v.turno_id
            )
            ORDER BY v.creado_en, v.id
        ),
        '[]'::jsonb
    )
    INTO v_ventas
    FROM ventas v
    WHERE v.creado_en >= v_inicio AND v.creado_en < v_fin;

    -- Productos vendidos (solo ventas registradas)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'producto_id', x.producto_id,
                'nombre', x.nombre,
                'cantidad', x.cantidad,
                'valor', x.valor
            )
            ORDER BY x.valor DESC, x.nombre, x.producto_id
        ),
        '[]'::jsonb
    )
    INTO v_productos
    FROM (
        SELECT d.producto_id,
               (array_agg(d.nombre_producto ORDER BY v.creado_en DESC, v.id DESC))[1] AS nombre,
               sum(d.cantidad) AS cantidad,
               sum(d.subtotal) AS valor
        FROM ventas v
        JOIN venta_detalles d ON d.venta_id = v.id
        WHERE v.creado_en >= v_inicio AND v.creado_en < v_fin
          AND v.estado = 'registrada'
        GROUP BY d.producto_id
    ) x;

    -- Gastos no eliminados del rango (con y sin turno) y sus orígenes
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', g.id,
                'creado_en', g.creado_en,
                'valor', g.valor,
                'concepto', g.concepto,
                'categoria_gasto_id', g.categoria_gasto_id,
                'registrado_por', g.registrado_por,
                'turno_id', g.turno_id,
                'origenes', origenes_gasto(g.id)
            )
            ORDER BY g.creado_en, g.id
        ),
        '[]'::jsonb
    )
    INTO v_gastos
    FROM gastos g
    WHERE g.creado_en >= v_inicio AND g.creado_en < v_fin
      AND g.eliminado_en IS NULL;

    -- Turnos abiertos en el rango
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', t.id,
                'abierto_por', t.abierto_por,
                'abierto_en', t.abierto_en,
                'cerrado_por', t.cerrado_por,
                'cerrado_en', t.cerrado_en,
                'base', t.base,
                'efectivo_contado', t.efectivo_contado,
                'efectivo_esperado', CASE
                    WHEN t.cerrado_en IS NULL THEN efectivo_esperado_turno(t.id)
                    ELSE t.efectivo_esperado
                END,
                'diferencia', t.diferencia,
                'por_metodo', COALESCE(pm.por_metodo, '[]'::jsonb),
                'total_gastos', COALESCE(tg.total_gastos, 0),
                'total_retiros', COALESCE(tr.total_retiros, 0),
                'base_siguiente', t.base_siguiente,
                'enviado_mayor', t.enviado_mayor
            )
            ORDER BY t.abierto_en, t.id
        ),
        '[]'::jsonb
    )
    INTO v_turnos
    FROM turnos t
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
                   jsonb_build_object('metodo_pago_id', m.metodo_pago_id, 'total', m.total)
                   ORDER BY m.metodo_pago_id
               ) AS por_metodo
        FROM (
            SELECT v.metodo_pago_id, sum(v.total) AS total
            FROM ventas v
            WHERE v.turno_id = t.id AND v.estado = 'registrada'
            GROUP BY v.metodo_pago_id
        ) m
    ) pm ON TRUE
    LEFT JOIN LATERAL (
        SELECT sum(g.valor) AS total_gastos
        FROM gastos g
        WHERE g.turno_id = t.id AND g.eliminado_en IS NULL
    ) tg ON TRUE
    LEFT JOIN LATERAL (
        SELECT sum(mv.valor) AS total_retiros
        FROM caja_mayor_movimientos mv
        WHERE mv.turno_id = t.id AND mv.tipo = 'retiro'
    ) tr ON TRUE
    WHERE t.abierto_en >= v_inicio AND t.abierto_en < v_fin;

    -- Métodos de pago, incluidos inactivos
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', m.id,
                'nombre', m.nombre,
                'es_efectivo', m.es_efectivo,
                'activo', m.activo
            )
            ORDER BY m.orden, m.nombre
        ),
        '[]'::jsonb
    )
    INTO v_metodos
    FROM metodos_pago m;

    -- Categorías de gasto, incluidas inactivas
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'nombre', c.nombre,
                'activo', c.activo
            )
            ORDER BY c.nombre
        ),
        '[]'::jsonb
    )
    INTO v_categorias
    FROM categorias_gasto c;

    RETURN jsonb_build_object(
        'ventas', v_ventas,
        'productos', v_productos,
        'gastos', v_gastos,
        'turnos', v_turnos,
        'metodos', v_metodos,
        'categorias_gasto', v_categorias
    );
END;
$$;

-- --------------------------------------------
-- Permisos
-- Internas: sin EXECUTE para PUBLIC, anon ni authenticated.
-- Públicas: solo anon y authenticated.
-- --------------------------------------------
REVOKE ALL ON FUNCTION origenes_gasto(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION movimiento_mayor_json(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION registrar_gasto(UUID, UUID, INTEGER, TEXT, UUID, TEXT, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION eliminar_gasto(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION registrar_retiro(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION saldos_caja_mayor() FROM PUBLIC;
REVOKE ALL ON FUNCTION movimientos_caja_mayor(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION ajustar_caja_mayor(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reporte_rango(DATE, DATE) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION registrar_gasto(UUID, UUID, INTEGER, TEXT, UUID, TEXT, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION eliminar_gasto(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_retiro(UUID, UUID, INTEGER, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION saldos_caja_mayor() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION movimientos_caja_mayor(DATE, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ajustar_caja_mayor(UUID, UUID, INTEGER, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reporte_rango(DATE, DATE) TO anon, authenticated;
