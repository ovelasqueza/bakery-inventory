-- ============================================
-- MIGRACIÓN: Ventas combinadas (productos + valores de calculadora)
-- Ejecutar este script en el SQL Editor de Supabase DESPUÉS de
-- supabase/migration-ventas.sql y supabase/migration-barra-acciones.sql.
--
-- Es idempotente: se puede ejecutar varias veces sin error.
-- Permite que una venta con tipo = 'productos' incluya tanto líneas de
-- productos del catálogo como líneas de valor ("Venta por valor") agregadas
-- desde la calculadora en el mismo pedido.
-- ============================================

-- 1. Permitir líneas de valor dentro de una venta de tipo 'productos'
CREATE OR REPLACE FUNCTION validar_linea_venta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
    v_tipo VARCHAR(10);
BEGIN
    SELECT tipo INTO v_tipo FROM ventas WHERE id = NEW.venta_id;

    -- Una venta de tipo 'valor' solo admite líneas sin producto.
    -- Una venta de tipo 'productos' admite líneas con producto y líneas de valor combinadas.
    IF v_tipo = 'valor' AND NEW.producto_id IS NOT NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS: la línea no coincide con el tipo de la venta';
    END IF;

    RETURN NEW;
END;
$$;

-- 2. RPC registrar_venta_combinada
-- Registra en una sola transacción e idempotentemente por p_clave una venta
-- que combina productos del catálogo (p_lineas) y valores de calculadora (p_valores).
CREATE OR REPLACE FUNCTION registrar_venta_combinada(
    p_clave UUID,
    p_turno UUID,
    p_metodo UUID,
    p_lineas jsonb,
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
    v_productos UUID[];
    v_cantidades INTEGER[];
    v_precios INTEGER[];
    v_n INTEGER;
    v_total_productos NUMERIC := 0;
    v_total_valores NUMERIC := 0;
    v_total NUMERIC;
    v_recibido INTEGER;
BEGIN
    IF p_clave IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- 1. Reintento: la venta ya se registró
    SELECT * INTO v_venta FROM ventas WHERE clave = p_clave;

    IF NOT FOUND THEN
        -- 2. Turno abierto, bloqueado hasta el final de la transacción
        SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = p_turno FOR UPDATE;
        IF NOT FOUND OR v_cerrado_en IS NOT NULL THEN
            RAISE EXCEPTION 'TURNO_CERRADO';
        END IF;

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

        -- 4. Validar líneas de productos (1..200)
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
               OR jsonb_typeof(l.e -> 'precio') IS DISTINCT FROM 'number'
        ) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_lineas) AS l(e)
            WHERE (l.e ->> 'producto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               OR (l.e ->> 'cantidad')::NUMERIC <> trunc((l.e ->> 'cantidad')::NUMERIC)
               OR (l.e ->> 'cantidad')::NUMERIC NOT BETWEEN 1 AND 999
               OR (l.e ->> 'precio')::NUMERIC <> trunc((l.e ->> 'precio')::NUMERIC)
               OR (l.e ->> 'precio')::NUMERIC NOT BETWEEN 0 AND 99999999
        ) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        SELECT array_agg((l.e ->> 'producto_id')::UUID ORDER BY l.n),
               array_agg((l.e ->> 'cantidad')::INTEGER ORDER BY l.n),
               array_agg((l.e ->> 'precio')::INTEGER ORDER BY l.n)
        INTO v_productos, v_cantidades, v_precios
        FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS l(e, n);

        SELECT count(DISTINCT x) INTO v_n FROM unnest(v_productos) AS x;
        IF v_n <> cardinality(v_productos) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

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

        IF EXISTS (
            SELECT 1
            FROM unnest(v_productos, v_precios) AS l(producto_id, precio)
            JOIN productos p ON p.id = l.producto_id
            WHERE p.precio_venta <> l.precio
        ) THEN
            RAISE EXCEPTION 'PRECIOS_ACTUALIZADOS';
        END IF;

        SELECT COALESCE(sum(l.cantidad * p.precio_venta), 0) INTO v_total_productos
        FROM unnest(v_productos, v_cantidades) AS l(producto_id, cantidad)
        JOIN productos p ON p.id = l.producto_id;

        -- 5. Validar valores de calculadora (opcionales, 0..200)
        IF p_valores IS NOT NULL AND jsonb_typeof(p_valores) = 'array' AND jsonb_array_length(p_valores) > 0 THEN
            IF jsonb_array_length(p_valores) > 200 THEN
                RAISE EXCEPTION 'DATOS_INVALIDOS';
            END IF;

            IF EXISTS (
                SELECT 1
                FROM jsonb_array_elements(p_valores) AS x(e)
                WHERE jsonb_typeof(x.e) IS DISTINCT FROM 'number'
            ) THEN
                RAISE EXCEPTION 'DATOS_INVALIDOS';
            END IF;

            IF EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(p_valores) AS x(e)
                WHERE x.e::NUMERIC <> trunc(x.e::NUMERIC)
                   OR x.e::NUMERIC NOT BETWEEN 1 AND 10000000
            ) THEN
                RAISE EXCEPTION 'DATOS_INVALIDOS';
            END IF;

            SELECT COALESCE(sum(x.e::NUMERIC), 0) INTO v_total_valores
            FROM jsonb_array_elements_text(p_valores) AS x(e);
        ELSIF p_valores IS NOT NULL AND jsonb_typeof(p_valores) <> 'array' THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        v_total := v_total_productos + v_total_valores;
        IF v_total IS NULL OR v_total NOT BETWEEN 0 AND 99999999 THEN
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

        -- 7. Insertar cabecera y detalles (productos + valores)
        INSERT INTO ventas (clave, turno_id, total, metodo_pago_id, es_efectivo,
                            efectivo_recibido, cambio, estado, tipo)
        VALUES (p_clave, p_turno, v_total::INTEGER, p_metodo, v_es_efectivo,
                v_recibido, v_recibido - v_total::INTEGER, 'registrada', 'productos')
        RETURNING * INTO v_venta;

        INSERT INTO venta_detalles (venta_id, producto_id, nombre_producto, cantidad, precio_unitario)
        SELECT v_venta.id, l.producto_id, p.nombre, l.cantidad, p.precio_venta
        FROM unnest(v_productos, v_cantidades) AS l(producto_id, cantidad)
        JOIN productos p ON p.id = l.producto_id;

        IF v_total_valores > 0 THEN
            INSERT INTO venta_detalles (venta_id, producto_id, nombre_producto, cantidad,
                                        precio_unitario, orden)
            SELECT v_venta.id, NULL, 'Venta por valor', 1, x.e::NUMERIC::INTEGER, x.n
            FROM jsonb_array_elements_text(p_valores) WITH ORDINALITY AS x(e, n);
        END IF;
    END IF;

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

REVOKE ALL ON FUNCTION registrar_venta_combinada(UUID, UUID, UUID, jsonb, jsonb, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_venta_combinada(UUID, UUID, UUID, jsonb, jsonb, INTEGER) TO anon, authenticated;
