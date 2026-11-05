-- ============================================
-- MIGRACIÓN: Barra de acciones, Autoconsumo y Calculadora
-- Ejecutar este script en el SQL Editor de Supabase DESPUÉS de
-- supabase/migration-ventas.sql y supabase/migration-caja-mayor.sql
-- (usa sus tablas, funciones y triggers).
--
-- Es idempotente: se puede ejecutar varias veces sin error.
-- Usa IF NOT EXISTS, CREATE OR REPLACE y DROP ... IF EXISTS + CREATE.
-- No borra ni renombra tablas, columnas ni filas existentes.
--
-- Compatibilidad con los datos existentes:
--   - Las ventas existentes quedan con tipo = 'productos' (DEFAULT).
--   - Sus líneas conservan producto_id y quedan con orden nulo.
--
-- Secciones:
--   1. Ventas por valor (ventas.tipo, venta_detalles sin producto)
--   2. Tablas de autoconsumo, seguridad e inmutabilidad
--   3. RPC de venta por valor y detalle de venta
--   4. RPC de autoconsumo, reporte y permisos
-- ============================================


-- ============================================
-- 1. VENTAS POR VALOR
-- Una Venta_Por_Valor es una venta con tipo = 'valor' cuyas líneas no
-- tienen producto: nombre 'Venta por valor', cantidad 1, precio igual
-- al valor digitado y orden 1..200 (orden en que se agregó).
-- Una venta tiene solo líneas de productos o solo líneas de valor.
-- UNIQUE (venta_id, producto_id) no estorba: los nulos son distintos.
-- ============================================

-- --------------------------------------------
-- ventas.tipo
-- Las filas existentes y las de registrar_venta quedan en 'productos'.
-- --------------------------------------------
ALTER TABLE ventas
ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'productos';

ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_tipo_valido;
ALTER TABLE ventas ADD CONSTRAINT ventas_tipo_valido
    CHECK (tipo IN ('productos', 'valor'));

-- --------------------------------------------
-- venta_detalles: producto opcional y orden de la Linea_Valor
-- --------------------------------------------
ALTER TABLE venta_detalles ALTER COLUMN producto_id DROP NOT NULL;

ALTER TABLE venta_detalles
ADD COLUMN IF NOT EXISTS orden SMALLINT;

-- Con producto: sin orden. Sin producto: Linea_Valor completa.
ALTER TABLE venta_detalles DROP CONSTRAINT IF EXISTS venta_detalles_linea_coherente;
ALTER TABLE venta_detalles ADD CONSTRAINT venta_detalles_linea_coherente CHECK (
    (producto_id IS NOT NULL AND orden IS NULL)
    OR
    (producto_id IS NULL
        AND nombre_producto = 'Venta por valor'
        AND cantidad = 1
        AND precio_unitario BETWEEN 1 AND 10000000
        AND orden BETWEEN 1 AND 200)
);

-- El orden no se repite dentro de una venta
CREATE UNIQUE INDEX IF NOT EXISTS venta_detalles_orden_unico
    ON venta_detalles (venta_id, orden) WHERE orden IS NOT NULL;

-- --------------------------------------------
-- validar_linea_venta: la línea debe coincidir con el tipo de la venta
-- Si la venta no existe, la llave foránea rechaza la inserción.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION validar_linea_venta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
    v_tipo VARCHAR(10);
BEGIN
    SELECT tipo INTO v_tipo FROM ventas WHERE id = NEW.venta_id;

    IF (v_tipo = 'valor' AND NEW.producto_id IS NOT NULL)
        OR (v_tipo = 'productos' AND NEW.producto_id IS NULL) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS: la línea no coincide con el tipo de la venta';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_linea_venta ON venta_detalles;
CREATE TRIGGER trigger_validar_linea_venta
    BEFORE INSERT ON venta_detalles
    FOR EACH ROW
    EXECUTE FUNCTION validar_linea_venta();

-- --------------------------------------------
-- proteger_ventas: igual que en migration-ventas.sql, con tipo entre
-- las columnas que no cambian al anular.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION proteger_ventas()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: las ventas no se borran';
    END IF;

    IF NOT (OLD.estado = 'registrada' AND NEW.estado = 'anulada') THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: solo se permite anular una venta registrada';
    END IF;

    -- Solo cambian estado y los cuatro campos de anulación
    IF (NEW.id, NEW.clave, NEW.turno_id, NEW.creado_en, NEW.total, NEW.metodo_pago_id,
        NEW.es_efectivo, NEW.efectivo_recibido, NEW.cambio, NEW.tipo)
        IS DISTINCT FROM
       (OLD.id, OLD.clave, OLD.turno_id, OLD.creado_en, OLD.total, OLD.metodo_pago_id,
        OLD.es_efectivo, OLD.efectivo_recibido, OLD.cambio, OLD.tipo) THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: al anular solo cambian los datos de anulación';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM turnos WHERE id = OLD.turno_id AND cerrado_en IS NULL
    ) THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    -- Que los cuatro campos queden llenos lo valida ventas_anulacion_coherente
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_ventas ON ventas;
CREATE TRIGGER trigger_proteger_ventas
    BEFORE UPDATE OR DELETE ON ventas
    FOR EACH ROW
    EXECUTE FUNCTION proteger_ventas();


-- ============================================
-- 2. TABLAS DE AUTOCONSUMO, SEGURIDAD E INMUTABILIDAD
-- Productos que se consumen en el local sin venderse. No toca dinero
-- ni stock: no entra a ventas, gastos, caja_mayor_* ni inventarios.
-- El precio es solo referencia (copia de precio_venta al registrar).
-- Se escribe solo por RPC (sección 4).
-- ============================================

-- --------------------------------------------
-- TABLA: autoconsumos
-- clave: idempotencia de registrar_autoconsumo.
-- anulado_en: se llena una vez, con el Turno abierto.
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS autoconsumos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    clave UUID NOT NULL UNIQUE,
    turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,
    consumido_por VARCHAR(60) NOT NULL
        CHECK (length(trim(consumido_por)) BETWEEN 1 AND 60),
    nota VARCHAR(120)
        CHECK (nota IS NULL OR length(trim(nota)) BETWEEN 1 AND 120),
    valor_referencia INTEGER NOT NULL
        CHECK (valor_referencia BETWEEN 0 AND 99999999),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    anulado_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS autoconsumos_turno ON autoconsumos (turno_id);
CREATE INDEX IF NOT EXISTS autoconsumos_creado_en ON autoconsumos (creado_en);

-- --------------------------------------------
-- TABLA: autoconsumo_detalles
-- Una línea por producto en cada autoconsumo.
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS autoconsumo_detalles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    autoconsumo_id UUID NOT NULL REFERENCES autoconsumos(id) ON DELETE RESTRICT,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    nombre_producto VARCHAR(255) NOT NULL,  -- copia al registrar
    cantidad INTEGER NOT NULL CHECK (cantidad BETWEEN 1 AND 999),
    precio_referencia INTEGER NOT NULL
        CHECK (precio_referencia BETWEEN 0 AND 99999999),
    subtotal INTEGER GENERATED ALWAYS AS (cantidad * precio_referencia) STORED,
    UNIQUE (autoconsumo_id, producto_id)
);

-- --------------------------------------------
-- Seguridad
-- RLS activado con solo una política SELECT. Sin políticas de escritura,
-- la llave anon solo puede leer; las escrituras pasan por las RPC
-- SECURITY DEFINER (dueño postgres, no sujeto a RLS).
-- --------------------------------------------
ALTER TABLE autoconsumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE autoconsumo_detalles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autoconsumos_leer" ON autoconsumos;
CREATE POLICY "autoconsumos_leer" ON autoconsumos
    FOR SELECT TO anon, authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "autoconsumo_detalles_leer" ON autoconsumo_detalles;
CREATE POLICY "autoconsumo_detalles_leer" ON autoconsumo_detalles
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- --------------------------------------------
-- proteger_autoconsumos
-- Se aplica a cualquier rol, incluidas las RPC. Solo permite llenar
-- anulado_en una vez, sin cambiar otra columna y con el Turno abierto.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION proteger_autoconsumos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: los autoconsumos no se borran';
    END IF;

    IF NOT (OLD.anulado_en IS NULL AND NEW.anulado_en IS NOT NULL) THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: solo se permite anular un autoconsumo vigente';
    END IF;

    -- Solo cambia anulado_en
    IF (NEW.id, NEW.clave, NEW.turno_id, NEW.consumido_por, NEW.nota,
        NEW.valor_referencia, NEW.creado_en)
        IS DISTINCT FROM
       (OLD.id, OLD.clave, OLD.turno_id, OLD.consumido_por, OLD.nota,
        OLD.valor_referencia, OLD.creado_en) THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: al anular solo cambia anulado_en';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM turnos WHERE id = OLD.turno_id AND cerrado_en IS NULL
    ) THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_autoconsumos ON autoconsumos;
CREATE TRIGGER trigger_proteger_autoconsumos
    BEFORE UPDATE OR DELETE ON autoconsumos
    FOR EACH ROW
    EXECUTE FUNCTION proteger_autoconsumos();

-- --------------------------------------------
-- proteger_autoconsumo_detalles: las líneas no cambian ni se borran
-- --------------------------------------------
CREATE OR REPLACE FUNCTION proteger_autoconsumo_detalles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: las líneas de autoconsumo no cambian';
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_autoconsumo_detalles ON autoconsumo_detalles;
CREATE TRIGGER trigger_proteger_autoconsumo_detalles
    BEFORE UPDATE OR DELETE ON autoconsumo_detalles
    FOR EACH ROW
    EXECUTE FUNCTION proteger_autoconsumo_detalles();


-- ============================================
-- 3. RPC DE VENTA POR VALOR Y DETALLE DE VENTA
-- ============================================

-- --------------------------------------------
-- registrar_venta_valor
--   p_valores = [valor, valor, ...]  (enteros 1..10.000.000, en el orden agregado)
--   → { venta_id, total, efectivo_recibido, cambio, es_efectivo, creado_en }
-- Mismo orden de pasos y misma respuesta que registrar_venta.
-- Igual que registrar_venta, el reintento con la misma clave devuelve la
-- venta original sin comparar los datos enviados (la clave la genera el
-- cliente a partir de la firma del pedido).
-- No toca productos ni inventarios.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION registrar_venta_valor(
    p_clave UUID,
    p_turno UUID,
    p_metodo UUID,
    p_valores jsonb,
    p_recibido INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_venta ventas%ROWTYPE;
    v_cerrado_en TIMESTAMP WITH TIME ZONE;
    v_es_efectivo BOOLEAN;
    v_total NUMERIC;
    v_recibido INTEGER;
BEGIN
    IF p_clave IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 1. Reintento: la venta ya se registró (aunque el turno ya esté cerrado)
    SELECT * INTO v_venta FROM ventas WHERE clave = p_clave;

    IF NOT FOUND THEN
        -- 2. Turno abierto, bloqueado hasta el final de la transacción
        SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = p_turno FOR UPDATE;
        IF NOT FOUND OR v_cerrado_en IS NOT NULL THEN
            RAISE EXCEPTION 'TURNO_CERRADO';
        END IF;

        -- Otro reintento simultáneo pudo registrarla mientras se esperaba el bloqueo
        SELECT * INTO v_venta FROM ventas WHERE clave = p_clave;
    END IF;

    IF NOT FOUND THEN
        -- 3. Método de pago activo
        SELECT es_efectivo INTO v_es_efectivo
        FROM metodos_pago
        WHERE id = p_metodo AND activo;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'METODO_INVALIDO';
        END IF;

        -- 4. Valores: arreglo de 1 a 200 números
        IF p_valores IS NULL OR jsonb_typeof(p_valores) <> 'array'
            OR jsonb_array_length(p_valores) NOT BETWEEN 1 AND 200 THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_valores) AS x(e)
            WHERE jsonb_typeof(x.e) IS DISTINCT FROM 'number'
        ) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- Con los tipos ya revisados, las conversiones no fallan
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(p_valores) AS x(e)
            WHERE x.e::NUMERIC <> trunc(x.e::NUMERIC)
               OR x.e::NUMERIC NOT BETWEEN 1 AND 10000000
        ) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- 5. Total = suma de los valores
        SELECT sum(x.e::NUMERIC) INTO v_total
        FROM jsonb_array_elements_text(p_valores) AS x(e);

        IF v_total IS NULL OR v_total NOT BETWEEN 1 AND 99999999 THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- 6. Efectivo recibido y cambio
        IF v_es_efectivo THEN
            IF p_recibido IS NULL OR p_recibido < v_total OR p_recibido > 10000000 THEN
                RAISE EXCEPTION 'RECIBIDO_INVALIDO';
            END IF;
            v_recibido := p_recibido;
        ELSE
            v_recibido := v_total::INTEGER;
        END IF;

        -- 7. Cabecera y Lineas_Valor en la misma transacción
        INSERT INTO ventas (clave, turno_id, total, metodo_pago_id, es_efectivo,
                            efectivo_recibido, cambio, estado, tipo)
        VALUES (p_clave, p_turno, v_total::INTEGER, p_metodo, v_es_efectivo,
                v_recibido, v_recibido - v_total::INTEGER, 'registrada', 'valor')
        RETURNING * INTO v_venta;

        INSERT INTO venta_detalles (venta_id, producto_id, nombre_producto, cantidad,
                                    precio_unitario, orden)
        SELECT v_venta.id, NULL, 'Venta por valor', 1, x.e::NUMERIC::INTEGER, x.n
        FROM jsonb_array_elements_text(p_valores) WITH ORDINALITY AS x(e, n);
    END IF;

    -- 8. Resultado (igual en el primer registro y en los reintentos)
    RETURN jsonb_build_object(
        'venta_id', v_venta.id,
        'total', v_venta.total,
        'efectivo_recibido', v_venta.efectivo_recibido,
        'cambio', v_venta.cambio,
        'es_efectivo', v_venta.es_efectivo,
        'creado_en', v_venta.creado_en
    );
END;
$$;

-- --------------------------------------------
-- detalle_venta(p_venta) (reemplaza la de migration-ventas.sql; misma firma)
--   { venta: { id, creado_en, total, metodo_pago_id, es_efectivo, efectivo_recibido,
--              cambio, estado, anulada_en, anulada_por, motivo_anulacion, turno_id, tipo },
--     detalles: [{ producto_id, nombre_producto, cantidad, precio_unitario, subtotal }] }
-- Las Lineas_Valor (producto_id nulo) salen en el orden en que se agregaron.
-- Venta inexistente → VENTA_NO_EXISTE
-- --------------------------------------------
CREATE OR REPLACE FUNCTION detalle_venta(p_venta UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_v ventas%ROWTYPE;
    v_detalles jsonb;
BEGIN
    SELECT * INTO v_v FROM ventas WHERE id = p_venta;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VENTA_NO_EXISTE';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'producto_id', d.producto_id,
                'nombre_producto', d.nombre_producto,
                'cantidad', d.cantidad,
                'precio_unitario', d.precio_unitario,
                'subtotal', d.subtotal
            )
            ORDER BY d.orden NULLS LAST, d.nombre_producto, d.producto_id
        ),
        '[]'::jsonb
    )
    INTO v_detalles
    FROM venta_detalles d
    WHERE d.venta_id = p_venta;

    RETURN jsonb_build_object(
        'venta', jsonb_build_object(
            'id', v_v.id,
            'creado_en', v_v.creado_en,
            'total', v_v.total,
            'metodo_pago_id', v_v.metodo_pago_id,
            'es_efectivo', v_v.es_efectivo,
            'efectivo_recibido', v_v.efectivo_recibido,
            'cambio', v_v.cambio,
            'estado', v_v.estado,
            'anulada_en', v_v.anulada_en,
            'anulada_por', v_v.anulada_por,
            'motivo_anulacion', v_v.motivo_anulacion,
            'turno_id', v_v.turno_id,
            'tipo', v_v.tipo
        ),
        'detalles', v_detalles
    );
END;
$$;

-- --------------------------------------------
-- Permisos de esta sección: solo anon y authenticated
-- --------------------------------------------
REVOKE ALL ON FUNCTION registrar_venta_valor(UUID, UUID, UUID, jsonb, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION detalle_venta(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION registrar_venta_valor(UUID, UUID, UUID, jsonb, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION detalle_venta(UUID) TO anon, authenticated;


-- ============================================
-- 4. RPC DE AUTOCONSUMO, REPORTE Y PERMISOS
-- ============================================

-- --------------------------------------------
-- registrar_autoconsumo
--   p_lineas = [{ producto_id, cantidad }]  (cantidad entera 1..999, sin repetir producto)
--   → { id, turno_id, consumido_por, nota, valor_referencia, creado_en, anulado_en,
--       lineas: [{ producto_id, nombre_producto, cantidad, precio_referencia, subtotal }] }
-- Copia nombre y precio_venta vigente de productos (solo referencia).
-- No toca ventas, gastos, caja_mayor_* ni inventarios.
-- El reintento con la misma clave devuelve el original sin comparar datos.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION registrar_autoconsumo(
    p_clave UUID,
    p_turno UUID,
    p_persona TEXT,
    p_nota TEXT,
    p_lineas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_a autoconsumos%ROWTYPE;
    v_cerrado_en TIMESTAMP WITH TIME ZONE;
    v_persona TEXT;
    v_nota TEXT;
    v_productos UUID[];
    v_cantidades INTEGER[];
    v_n INTEGER;
    v_total NUMERIC;
    v_lineas jsonb;
BEGIN
    IF p_clave IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 1. Reintento: el autoconsumo ya se registró (aunque el turno ya esté cerrado)
    SELECT * INTO v_a FROM autoconsumos WHERE clave = p_clave;

    IF NOT FOUND THEN
        -- 2. Turno abierto, bloqueado hasta el final de la transacción
        SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = p_turno FOR UPDATE;
        IF NOT FOUND OR v_cerrado_en IS NOT NULL THEN
            RAISE EXCEPTION 'TURNO_CERRADO';
        END IF;

        -- Otro reintento simultáneo pudo registrarlo mientras se esperaba el bloqueo
        SELECT * INTO v_a FROM autoconsumos WHERE clave = p_clave;
    END IF;

    IF NOT FOUND THEN
        -- 3. Persona (1..60) y nota (vacía = nula, o 1..120)
        v_persona := trim(p_persona);
        IF v_persona IS NULL OR length(v_persona) NOT BETWEEN 1 AND 60 THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        v_nota := NULLIF(trim(p_nota), '');
        IF v_nota IS NOT NULL AND length(v_nota) > 120 THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- 4. Líneas: arreglo de 1 a 200 objetos con tipos correctos
        IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array'
            OR jsonb_array_length(p_lineas) NOT BETWEEN 1 AND 200 THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_lineas) AS l(e)
            WHERE jsonb_typeof(l.e) IS DISTINCT FROM 'object'
               OR jsonb_typeof(l.e -> 'producto_id') IS DISTINCT FROM 'string'
               OR jsonb_typeof(l.e -> 'cantidad') IS DISTINCT FROM 'number'
        ) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- Con los tipos ya revisados, las conversiones no fallan
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_lineas) AS l(e)
            WHERE (l.e ->> 'producto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               OR (l.e ->> 'cantidad')::NUMERIC <> trunc((l.e ->> 'cantidad')::NUMERIC)
               OR (l.e ->> 'cantidad')::NUMERIC NOT BETWEEN 1 AND 999
        ) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        SELECT array_agg((l.e ->> 'producto_id')::UUID ORDER BY l.n),
               array_agg((l.e ->> 'cantidad')::INTEGER ORDER BY l.n)
        INTO v_productos, v_cantidades
        FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS l(e, n);

        -- Productos sin repetir
        SELECT count(DISTINCT x) INTO v_n FROM unnest(v_productos) AS x;
        IF v_n <> cardinality(v_productos) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- 5. Cada producto está en el catálogo de la Caja (mismo criterio que registrar_venta)
        IF EXISTS (
            SELECT 1
            FROM unnest(v_productos) AS l(producto_id)
            LEFT JOIN productos p ON p.id = l.producto_id
            WHERE p.id IS NULL
               OR NOT COALESCE(p.activo, FALSE)
               OR COALESCE(p.tipo_producto, 'normal') = 'materia_prima'
               OR NOT p.visible_caja
               OR p.precio_venta IS NULL
        ) THEN
            RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE';
        END IF;

        -- 6. Valor de referencia con el precio de venta vigente
        SELECT sum(l.cantidad * round(p.precio_venta)) INTO v_total
        FROM unnest(v_productos, v_cantidades) AS l(producto_id, cantidad)
        JOIN productos p ON p.id = l.producto_id;

        IF v_total IS NULL OR v_total NOT BETWEEN 0 AND 99999999 THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- 7. Cabecera y detalles en la misma transacción
        INSERT INTO autoconsumos (clave, turno_id, consumido_por, nota, valor_referencia)
        VALUES (p_clave, p_turno, v_persona, v_nota, v_total::INTEGER)
        RETURNING * INTO v_a;

        INSERT INTO autoconsumo_detalles (autoconsumo_id, producto_id, nombre_producto,
                                          cantidad, precio_referencia)
        SELECT v_a.id, l.producto_id, p.nombre, l.cantidad, round(p.precio_venta)::INTEGER
        FROM unnest(v_productos, v_cantidades) AS l(producto_id, cantidad)
        JOIN productos p ON p.id = l.producto_id;
    END IF;

    -- 8. Resultado (igual en el primer registro y en los reintentos)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'producto_id', d.producto_id,
                'nombre_producto', d.nombre_producto,
                'cantidad', d.cantidad,
                'precio_referencia', d.precio_referencia,
                'subtotal', d.subtotal
            )
            ORDER BY d.nombre_producto, d.producto_id
        ),
        '[]'::jsonb
    )
    INTO v_lineas
    FROM autoconsumo_detalles d
    WHERE d.autoconsumo_id = v_a.id;

    RETURN jsonb_build_object(
        'id', v_a.id,
        'turno_id', v_a.turno_id,
        'consumido_por', v_a.consumido_por,
        'nota', v_a.nota,
        'valor_referencia', v_a.valor_referencia,
        'creado_en', v_a.creado_en,
        'anulado_en', v_a.anulado_en,
        'lineas', v_lineas
    );
END;
$$;

-- --------------------------------------------
-- anular_autoconsumo
-- Autoconsumo inexistente → AUTOCONSUMO_NO_EXISTE
-- Ya anulado → termina sin cambios
-- Turno cerrado → TURNO_CERRADO
-- --------------------------------------------
CREATE OR REPLACE FUNCTION anular_autoconsumo(p_autoconsumo UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_turno UUID;
    v_cerrado_en TIMESTAMP WITH TIME ZONE;
    v_anulado_en TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT turno_id INTO v_turno FROM autoconsumos WHERE id = p_autoconsumo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AUTOCONSUMO_NO_EXISTE';
    END IF;

    -- Bloqueo del turno y luego del autoconsumo (mismo orden que las demás RPC)
    SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = v_turno FOR UPDATE;
    SELECT anulado_en INTO v_anulado_en FROM autoconsumos WHERE id = p_autoconsumo FOR UPDATE;

    IF v_anulado_en IS NOT NULL THEN
        RETURN;
    END IF;

    IF v_cerrado_en IS NOT NULL THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    UPDATE autoconsumos SET anulado_en = NOW() WHERE id = p_autoconsumo;
END;
$$;

-- --------------------------------------------
-- reporte_rango (reemplaza la de migration-caja-mayor.sql; misma firma)
-- p_desde/p_hasta nulos, p_desde > p_hasta o más de 366 días → RANGO_INVALIDO
--   { ventas:    [{ id, creado_en, total, metodo_pago_id, efectivo_recibido, cambio,
--                   estado, anulada_en, anulada_por, motivo_anulacion, turno_id, tipo }]
--                 todas las del rango, incluidas anuladas
--     productos: [{ producto_id, nombre, cantidad, valor }]
--                 detalles de ventas registradas del rango, agrupados por producto;
--                 las Lineas_Valor (producto_id nulo) quedan en una sola fila
--                 "Venta por valor" con cantidad = número de valores
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
--     categorias_gasto: [{ id, nombre, activo }]               todas
--     autoconsumos: [{ id, creado_en, turno_id, consumido_por, nota, valor_referencia,
--                      lineas: [{ producto_id, nombre_producto, cantidad,
--                                 precio_referencia, subtotal }] }]
--                 no anulados del rango; no entran en ninguna suma de dinero }
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
    v_autoconsumos jsonb;
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
                'turno_id', v.turno_id,
                'tipo', v.tipo
            )
            ORDER BY v.creado_en, v.id
        ),
        '[]'::jsonb
    )
    INTO v_ventas
    FROM ventas v
    WHERE v.creado_en >= v_inicio AND v.creado_en < v_fin;

    -- Productos vendidos (solo ventas registradas).
    -- GROUP BY trata los nulos como un solo grupo: todas las Lineas_Valor
    -- quedan en una fila con producto_id nulo y nombre "Venta por valor".
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

    -- Autoconsumos no anulados del rango, con sus líneas
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'creado_en', a.creado_en,
                'turno_id', a.turno_id,
                'consumido_por', a.consumido_por,
                'nota', a.nota,
                'valor_referencia', a.valor_referencia,
                'lineas', COALESCE(ld.lineas, '[]'::jsonb)
            )
            ORDER BY a.creado_en, a.id
        ),
        '[]'::jsonb
    )
    INTO v_autoconsumos
    FROM autoconsumos a
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
                   jsonb_build_object(
                       'producto_id', d.producto_id,
                       'nombre_producto', d.nombre_producto,
                       'cantidad', d.cantidad,
                       'precio_referencia', d.precio_referencia,
                       'subtotal', d.subtotal
                   )
                   ORDER BY d.nombre_producto, d.producto_id
               ) AS lineas
        FROM autoconsumo_detalles d
        WHERE d.autoconsumo_id = a.id
    ) ld ON TRUE
    WHERE a.creado_en >= v_inicio AND a.creado_en < v_fin
      AND a.anulado_en IS NULL;

    RETURN jsonb_build_object(
        'ventas', v_ventas,
        'productos', v_productos,
        'gastos', v_gastos,
        'turnos', v_turnos,
        'metodos', v_metodos,
        'categorias_gasto', v_categorias,
        'autoconsumos', v_autoconsumos
    );
END;
$$;

-- --------------------------------------------
-- Permisos de esta sección: solo anon y authenticated
-- Las funciones de trigger no reciben GRANT.
-- --------------------------------------------
REVOKE ALL ON FUNCTION registrar_autoconsumo(UUID, UUID, TEXT, TEXT, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION anular_autoconsumo(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION reporte_rango(DATE, DATE) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION registrar_autoconsumo(UUID, UUID, TEXT, TEXT, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION anular_autoconsumo(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reporte_rango(DATE, DATE) TO anon, authenticated;
