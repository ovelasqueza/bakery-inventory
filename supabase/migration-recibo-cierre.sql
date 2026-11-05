-- ============================================
-- MIGRACIÓN: Recibo de cierre de turno
-- Ejecutar este script en el SQL Editor de Supabase DESPUÉS de
--   1. supabase/migration-ventas.sql
--   2. supabase/migration-caja-mayor.sql
--   3. supabase/migration-barra-acciones.sql
-- (usa sus tablas y la columna ventas.tipo).
--
-- Es idempotente: se puede ejecutar varias veces sin error.
-- Solo usa CREATE OR REPLACE FUNCTION y permisos.
-- No crea, borra ni modifica tablas, columnas ni filas.
-- No cambia cerrar_turno, resumen_turno ni ninguna otra función.
-- ============================================


-- --------------------------------------------
-- recibo_cierre: datos del Recibo_Cierre de un Turno cerrado.
--   { turno: { id, abierto_por, abierto_en, cerrado_por, cerrado_en, base,
--              efectivo_esperado, efectivo_contado, diferencia,
--              base_siguiente, enviado_mayor },
--     ventas: { total, cantidad, efectivo, valor_total,
--               anuladas_total, anuladas_cantidad,
--               por_metodo: [{ nombre, es_efectivo, total, cantidad }] },
--     gastos: { lista: [{ creado_en, categoria, concepto, valor, cajon, mayor }],
--               total, cajon, mayor },
--     retiros: { lista: [{ creado_en, valor }], total },
--     productos: [{ nombre, cantidad, valor }],
--     autoconsumo: { productos: [{ nombre, cantidad, valor }], total } }
--
-- turno.*: lo que guardó cerrar_turno (no se recalcula el esperado).
--   base_siguiente y enviado_mayor son null en turnos cerrados antes de
--   migration-caja-mayor.sql.
-- ventas: solo registradas, salvo anuladas_*. por_metodo con el mismo
--   agrupado de resumen_turno; efectivo igual que efectivo_esperado_turno;
--   valor_total = ventas registradas con tipo = 'valor'.
-- gastos: no eliminados; mayor = orígenes con Parte de la Caja mayor,
--   cajon = valor − mayor (Parte_Cajon de efectivo_esperado_turno).
-- retiros: movimientos 'retiro' del turno.
-- productos: SOLO líneas de ventas registradas (mismo agrupado de
--   reporte_rango); las Lineas_Valor quedan en una fila "Venta por valor".
-- autoconsumo: lista aparte, nunca se mezcla con productos ni ventas.
--   Autoconsumos no anulados agrupados por producto; el valor es solo de
--   referencia y no entra en ninguna suma de dinero.
-- Todos los montos son enteros (pesos colombianos).
--
-- Turno inexistente → TURNO_NO_ABIERTO
-- Turno abierto     → TURNO_NO_CERRADO
-- --------------------------------------------
CREATE OR REPLACE FUNCTION recibo_cierre(p_turno UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_t turnos%ROWTYPE;
    v_ventas jsonb;
    v_por_metodo jsonb;
    v_gastos_lista jsonb;
    v_gastos_total BIGINT;
    v_gastos_mayor BIGINT;
    v_retiros_lista jsonb;
    v_retiros_total BIGINT;
    v_productos jsonb;
    v_auto_productos jsonb;
    v_auto_total BIGINT;
BEGIN
    SELECT * INTO v_t FROM turnos WHERE id = p_turno;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TURNO_NO_ABIERTO';
    END IF;

    IF v_t.cerrado_en IS NULL THEN
        RAISE EXCEPTION 'TURNO_NO_CERRADO';
    END IF;

    -- Totales de ventas
    SELECT jsonb_build_object(
        'total', COALESCE(sum(v.total) FILTER (WHERE v.estado = 'registrada'), 0),
        'cantidad', count(*) FILTER (WHERE v.estado = 'registrada'),
        'efectivo', COALESCE(sum(v.total) FILTER (
            WHERE v.estado = 'registrada' AND v.es_efectivo), 0),
        'valor_total', COALESCE(sum(v.total) FILTER (
            WHERE v.estado = 'registrada' AND v.tipo = 'valor'), 0),
        'anuladas_total', COALESCE(sum(v.total) FILTER (WHERE v.estado = 'anulada'), 0),
        'anuladas_cantidad', count(*) FILTER (WHERE v.estado = 'anulada')
    )
    INTO v_ventas
    FROM ventas v
    WHERE v.turno_id = p_turno;

    -- Por método de pago (mismo agrupado de resumen_turno)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
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

    v_ventas := v_ventas || jsonb_build_object('por_metodo', v_por_metodo);

    -- Gastos no eliminados con su Parte_Cajon y su parte de Caja mayor
    SELECT COALESCE(
               jsonb_agg(
                   jsonb_build_object(
                       'creado_en', x.creado_en,
                       'categoria', x.categoria,
                       'concepto', x.concepto,
                       'valor', x.valor,
                       'cajon', x.valor - x.mayor,
                       'mayor', x.mayor
                   )
                   ORDER BY x.creado_en, x.id
               ),
               '[]'::jsonb
           ),
           COALESCE(sum(x.valor), 0),
           COALESCE(sum(x.mayor), 0)
    INTO v_gastos_lista, v_gastos_total, v_gastos_mayor
    FROM (
        SELECT g.id, g.creado_en, c.nombre AS categoria, g.concepto, g.valor,
               COALESCE(o.mayor, 0) AS mayor
        FROM gastos g
        JOIN categorias_gasto c ON c.id = g.categoria_gasto_id
        LEFT JOIN LATERAL (
            SELECT sum(go.valor) AS mayor
            FROM gasto_origenes go
            WHERE go.gasto_id = g.id AND go.parte_id IS NOT NULL
        ) o ON TRUE
        WHERE g.turno_id = p_turno AND g.eliminado_en IS NULL
    ) x;

    -- Retiros del turno
    SELECT COALESCE(
               jsonb_agg(
                   jsonb_build_object('creado_en', mv.creado_en, 'valor', mv.valor)
                   ORDER BY mv.creado_en, mv.id
               ),
               '[]'::jsonb
           ),
           COALESCE(sum(mv.valor), 0)
    INTO v_retiros_lista, v_retiros_total
    FROM caja_mayor_movimientos mv
    WHERE mv.turno_id = p_turno AND mv.tipo = 'retiro';

    -- Productos vendidos: solo ventas registradas (mismo agrupado de
    -- reporte_rango). Los nulos forman un solo grupo: "Venta por valor".
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
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
               CASE
                   WHEN d.producto_id IS NULL THEN 'Venta por valor'
                   ELSE (array_agg(d.nombre_producto ORDER BY v.creado_en DESC, v.id DESC))[1]
               END AS nombre,
               sum(d.cantidad) AS cantidad,
               sum(d.subtotal) AS valor
        FROM ventas v
        JOIN venta_detalles d ON d.venta_id = v.id
        WHERE v.turno_id = p_turno AND v.estado = 'registrada'
        GROUP BY d.producto_id
    ) x;

    -- Autoconsumo: aparte de los productos vendidos. Solo no anulados,
    -- agrupados por producto; valor de referencia, no es dinero.
    SELECT COALESCE(
               jsonb_agg(
                   jsonb_build_object(
                       'nombre', x.nombre,
                       'cantidad', x.cantidad,
                       'valor', x.valor
                   )
                   ORDER BY x.valor DESC, x.nombre, x.producto_id
               ),
               '[]'::jsonb
           ),
           COALESCE(sum(x.valor), 0)
    INTO v_auto_productos, v_auto_total
    FROM (
        SELECT d.producto_id,
               (array_agg(d.nombre_producto ORDER BY a.creado_en DESC, a.id DESC))[1] AS nombre,
               sum(d.cantidad) AS cantidad,
               sum(d.subtotal) AS valor
        FROM autoconsumos a
        JOIN autoconsumo_detalles d ON d.autoconsumo_id = a.id
        WHERE a.turno_id = p_turno AND a.anulado_en IS NULL
        GROUP BY d.producto_id
    ) x;

    RETURN jsonb_build_object(
        'turno', jsonb_build_object(
            'id', v_t.id,
            'abierto_por', v_t.abierto_por,
            'abierto_en', v_t.abierto_en,
            'cerrado_por', v_t.cerrado_por,
            'cerrado_en', v_t.cerrado_en,
            'base', v_t.base,
            'efectivo_esperado', v_t.efectivo_esperado,
            'efectivo_contado', v_t.efectivo_contado,
            'diferencia', v_t.diferencia,
            'base_siguiente', v_t.base_siguiente,
            'enviado_mayor', v_t.enviado_mayor
        ),
        'ventas', v_ventas,
        'gastos', jsonb_build_object(
            'lista', v_gastos_lista,
            'total', v_gastos_total,
            'cajon', v_gastos_total - v_gastos_mayor,
            'mayor', v_gastos_mayor
        ),
        'retiros', jsonb_build_object(
            'lista', v_retiros_lista,
            'total', v_retiros_total
        ),
        'productos', v_productos,
        'autoconsumo', jsonb_build_object(
            'productos', v_auto_productos,
            'total', v_auto_total
        )
    );
END;
$$;

-- --------------------------------------------
-- Permisos: solo anon y authenticated
-- --------------------------------------------
REVOKE ALL ON FUNCTION recibo_cierre(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recibo_cierre(UUID) TO anon, authenticated;
