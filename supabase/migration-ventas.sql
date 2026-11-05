-- ============================================
-- MIGRACIÓN: Caja, ventas y reportes
-- Ejecutar este script en el SQL Editor de Supabase
--
-- Es idempotente: se puede ejecutar varias veces sin error.
-- Usa IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS + CREATE
-- y datos iniciales con WHERE NOT EXISTS / ON CONFLICT DO NOTHING.
-- No borra ni renombra tablas, columnas ni filas existentes.
--
-- Secciones:
--   1. Extensiones
--   2. Utilidades
--   3. Columnas nuevas en productos
--   4. Tablas de parámetros (métodos de pago, categorías de gasto, personas)
--   5. Datos iniciales
--   6. Seguridad de configuracion (RLS que oculta las claves *_hash)
--   7. Tablas de movimientos (turnos, ventas, venta_detalles, gastos)
--   8. Seguridad de movimientos (RLS de solo lectura)
--   9. Triggers de inmutabilidad
--  10. Storage (bucket productos)
--  11. Funciones RPC de turno, venta y gasto
--  12. Funciones RPC de PIN y reportes
-- ============================================


-- ============================================
-- 1. EXTENSIONES
-- ============================================

CREATE SCHEMA IF NOT EXISTS extensions;

-- uuid_generate_v4() (ya existe si se ejecutó schema.sql)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- crypt() y gen_salt('bf') para el PIN de administración
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ============================================
-- 2. UTILIDADES
-- ============================================

-- Clave de unicidad de nombres: sin espacios extremos, minúsculas
-- y sin tildes ni diéresis (la ñ se conserva).
-- Se usa en los índices únicos de las tablas de parámetros.
CREATE OR REPLACE FUNCTION normalizar_nombre(p TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(translate(trim(p), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'))
$$;


-- ============================================
-- 3. COLUMNAS NUEVAS EN productos
-- Las filas existentes quedan visibles en la Caja, con orden 0 y sin foto.
-- ============================================

-- Categoría del producto (ya existe si la base viene de schema.sql)
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL;

-- Ruta de la foto en el bucket 'productos': {productoId}-{ms}.webp
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS imagen_path TEXT;

-- Si el producto aparece en la Caja
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS visible_caja BOOLEAN NOT NULL DEFAULT TRUE;

-- Orden del producto en la Caja (menor primero)
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS orden_caja INTEGER NOT NULL DEFAULT 0
CHECK (orden_caja BETWEEN 0 AND 9999);

-- Precio de venta al público en COP enteros (lo que cobra la Caja).
-- precio_actual sigue siendo el costo que usa el inventario.
-- NULL = sin precio de venta: el producto no aparece en la Caja.
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS precio_venta INTEGER
CHECK (precio_venta IS NULL OR precio_venta BETWEEN 0 AND 99999999);


-- ============================================
-- 4. TABLAS DE PARÁMETROS
-- RLS desactivado, igual que productos y configuracion (fix-rls.sql).
-- La aplicación las edita directamente. Los nombres son únicos sin
-- distinguir mayúsculas, tildes ni espacios extremos.
-- ============================================

-- --------------------------------------------
-- TABLA: metodos_pago
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS metodos_pago (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre VARCHAR(40) NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 40),
    es_efectivo BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    orden INTEGER NOT NULL DEFAULT 0 CHECK (orden BETWEEN 0 AND 999),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE UNIQUE INDEX IF NOT EXISTS metodos_pago_nombre_unico
    ON metodos_pago (normalizar_nombre(nombre));

DROP TRIGGER IF EXISTS update_metodos_pago_updated_at ON metodos_pago;
CREATE TRIGGER update_metodos_pago_updated_at
    BEFORE UPDATE ON metodos_pago
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Siempre debe quedar al menos un método de pago activo de efectivo.
-- Si un UPDATE o DELETE lo impide, se revierte la transacción.
CREATE OR REPLACE FUNCTION validar_metodo_efectivo()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM metodos_pago WHERE activo AND es_efectivo
    ) THEN
        RAISE EXCEPTION 'SIN_METODO_EFECTIVO';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validar_metodo_efectivo ON metodos_pago;
CREATE TRIGGER trigger_validar_metodo_efectivo
    AFTER UPDATE OR DELETE ON metodos_pago
    FOR EACH ROW
    EXECUTE FUNCTION validar_metodo_efectivo();

ALTER TABLE metodos_pago DISABLE ROW LEVEL SECURITY;

-- --------------------------------------------
-- TABLA: categorias_gasto
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_gasto (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre VARCHAR(40) NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 40),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE UNIQUE INDEX IF NOT EXISTS categorias_gasto_nombre_unico
    ON categorias_gasto (normalizar_nombre(nombre));

DROP TRIGGER IF EXISTS update_categorias_gasto_updated_at ON categorias_gasto;
CREATE TRIGGER update_categorias_gasto_updated_at
    BEFORE UPDATE ON categorias_gasto
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE categorias_gasto DISABLE ROW LEVEL SECURITY;

-- --------------------------------------------
-- TABLA: personas_caja
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS personas_caja (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 60),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE UNIQUE INDEX IF NOT EXISTS personas_caja_nombre_unico
    ON personas_caja (normalizar_nombre(nombre));

DROP TRIGGER IF EXISTS update_personas_caja_updated_at ON personas_caja;
CREATE TRIGGER update_personas_caja_updated_at
    BEFORE UPDATE ON personas_caja
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE personas_caja DISABLE ROW LEVEL SECURITY;


-- ============================================
-- 5. DATOS INICIALES
-- Solo se insertan si no existe un nombre o clave equivalente.
-- ============================================

-- Métodos de pago
INSERT INTO metodos_pago (nombre, es_efectivo, activo, orden)
SELECT 'Efectivo', TRUE, TRUE, 0
WHERE NOT EXISTS (
    SELECT 1 FROM metodos_pago WHERE normalizar_nombre(nombre) = normalizar_nombre('Efectivo')
);

INSERT INTO metodos_pago (nombre, es_efectivo, activo, orden)
SELECT 'Transferencia', FALSE, TRUE, 1
WHERE NOT EXISTS (
    SELECT 1 FROM metodos_pago WHERE normalizar_nombre(nombre) = normalizar_nombre('Transferencia')
);

INSERT INTO metodos_pago (nombre, es_efectivo, activo, orden)
SELECT 'Nequi', FALSE, TRUE, 2
WHERE NOT EXISTS (
    SELECT 1 FROM metodos_pago WHERE normalizar_nombre(nombre) = normalizar_nombre('Nequi')
);

-- Categorías de gasto
INSERT INTO categorias_gasto (nombre)
SELECT v.nombre
FROM (VALUES ('Insumos'), ('Servicios'), ('Transporte'), ('Otros')) AS v(nombre)
WHERE NOT EXISTS (
    SELECT 1 FROM categorias_gasto c WHERE normalizar_nombre(c.nombre) = normalizar_nombre(v.nombre)
);

-- Configuración de la Caja
-- admin_pin_hash no se crea: su ausencia significa "sin PIN".
INSERT INTO configuracion (clave, valor, descripcion) VALUES
    ('base_caja_defecto', '0', 'Base de caja sugerida al abrir un turno (pesos enteros)'),
    ('cajon_al_cobrar', 'true', 'Abrir el cajón al registrar una venta en efectivo'),
    ('cajon_en_turno', 'true', 'Abrir el cajón al abrir y al cerrar un turno')
ON CONFLICT (clave) DO NOTHING;


-- ============================================
-- 6. SEGURIDAD DE configuracion
-- Activa RLS para que la llave anon no pueda leer ni escribir las filas
-- cuya clave termina en '_hash' (app_password_hash, admin_pin_hash).
-- El resto de claves (porcentaje_descuento_produccion, base_caja_defecto,
-- cajon_*) siguen visibles y editables desde la aplicación.
-- verificar_password y las RPC del PIN son SECURITY DEFINER y su dueño
-- (postgres, dueño de la tabla) no queda sujeto a RLS, así que siguen
-- funcionando. No se usa FORCE ROW LEVEL SECURITY por ese motivo.
-- ============================================

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "configuracion_sin_hash" ON configuracion;
CREATE POLICY "configuracion_sin_hash" ON configuracion
    FOR ALL TO anon, authenticated
    USING (clave NOT LIKE '%\_hash')
    WITH CHECK (clave NOT LIKE '%\_hash');


-- ============================================
-- 7. TABLAS DE MOVIMIENTOS
-- Montos en pesos colombianos enteros (INTEGER).
-- Fechas TIMESTAMPTZ con NOW() del servidor (se guardan en UTC).
-- Las claves UUID UNIQUE (clave, clave_apertura, clave_cierre,
-- clave_anulacion) hacen idempotentes los reintentos de las RPC.
-- ============================================

-- --------------------------------------------
-- TABLA: turnos
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS turnos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    clave_apertura UUID NOT NULL UNIQUE,
    abierto_por VARCHAR(60) NOT NULL CHECK (length(trim(abierto_por)) BETWEEN 1 AND 60),
    base INTEGER NOT NULL CHECK (base BETWEEN 0 AND 99999999),
    abierto_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    cerrado_en TIMESTAMP WITH TIME ZONE,
    cerrado_por VARCHAR(60),
    clave_cierre UUID UNIQUE,
    efectivo_contado INTEGER CHECK (efectivo_contado BETWEEN 0 AND 99999999),
    efectivo_esperado INTEGER CHECK (efectivo_esperado BETWEEN -99999999 AND 99999999),
    diferencia INTEGER CHECK (diferencia BETWEEN -99999999 AND 99999999),
    -- Abierto: sin ningún dato de cierre. Cerrado: con todos y diferencia exacta.
    CONSTRAINT turnos_cierre_coherente CHECK (
        (cerrado_en IS NULL AND cerrado_por IS NULL AND clave_cierre IS NULL
            AND efectivo_contado IS NULL AND efectivo_esperado IS NULL AND diferencia IS NULL)
        OR
        (cerrado_en IS NOT NULL AND length(trim(cerrado_por)) BETWEEN 1 AND 60
            AND clave_cierre IS NOT NULL
            AND efectivo_contado IS NOT NULL AND efectivo_esperado IS NOT NULL
            AND diferencia = efectivo_contado - efectivo_esperado)
    )
);

-- Un único turno abierto en toda la panadería
CREATE UNIQUE INDEX IF NOT EXISTS turnos_un_abierto
    ON turnos ((TRUE)) WHERE cerrado_en IS NULL;

CREATE INDEX IF NOT EXISTS turnos_abierto_en ON turnos (abierto_en DESC);

-- --------------------------------------------
-- TABLA: ventas
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS ventas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    clave UUID NOT NULL UNIQUE,
    turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    total INTEGER NOT NULL CHECK (total BETWEEN 0 AND 99999999),
    metodo_pago_id UUID NOT NULL REFERENCES metodos_pago(id) ON DELETE RESTRICT,
    -- Copia de metodos_pago.es_efectivo al momento de vender
    es_efectivo BOOLEAN NOT NULL,
    efectivo_recibido INTEGER NOT NULL CHECK (efectivo_recibido BETWEEN 0 AND 99999999),
    cambio INTEGER NOT NULL CHECK (cambio >= 0),
    estado VARCHAR(10) NOT NULL DEFAULT 'registrada'
        CHECK (estado IN ('registrada', 'anulada')),
    anulada_en TIMESTAMP WITH TIME ZONE,
    anulada_por VARCHAR(60),
    motivo_anulacion VARCHAR(200),
    clave_anulacion UUID UNIQUE,
    -- Cambio exacto; sin efectivo, recibido = total y cambio 0
    CONSTRAINT ventas_pago_coherente CHECK (
        efectivo_recibido >= total
        AND cambio = efectivo_recibido - total
        AND (es_efectivo OR (efectivo_recibido = total AND cambio = 0))
    ),
    -- Registrada: sin datos de anulación. Anulada: con los cuatro.
    CONSTRAINT ventas_anulacion_coherente CHECK (
        (estado = 'registrada' AND anulada_en IS NULL AND anulada_por IS NULL
            AND motivo_anulacion IS NULL AND clave_anulacion IS NULL)
        OR
        (estado = 'anulada' AND anulada_en IS NOT NULL
            AND length(trim(anulada_por)) BETWEEN 1 AND 60
            AND length(trim(motivo_anulacion)) BETWEEN 3 AND 200
            AND clave_anulacion IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ventas_turno ON ventas (turno_id);
CREATE INDEX IF NOT EXISTS ventas_creado_en ON ventas (creado_en);

-- --------------------------------------------
-- TABLA: venta_detalles
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS venta_detalles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    -- Copia del nombre del producto al momento de vender
    nombre_producto VARCHAR(255) NOT NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad BETWEEN 1 AND 999),
    precio_unitario INTEGER NOT NULL CHECK (precio_unitario BETWEEN 0 AND 99999999),
    subtotal INTEGER GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
    UNIQUE (venta_id, producto_id)
);

CREATE INDEX IF NOT EXISTS venta_detalles_producto ON venta_detalles (producto_id);

-- --------------------------------------------
-- TABLA: gastos
-- Un gasto eliminado conserva la fila con eliminado_en lleno y se
-- excluye de sumas, listas y reportes.
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS gastos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    clave UUID NOT NULL UNIQUE,
    turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,
    valor INTEGER NOT NULL CHECK (valor BETWEEN 1 AND 10000000),
    concepto VARCHAR(120) NOT NULL CHECK (length(trim(concepto)) BETWEEN 1 AND 120),
    categoria_gasto_id UUID NOT NULL REFERENCES categorias_gasto(id) ON DELETE RESTRICT,
    registrado_por VARCHAR(60) NOT NULL CHECK (length(trim(registrado_por)) BETWEEN 1 AND 60),
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    eliminado_en TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS gastos_turno ON gastos (turno_id);
CREATE INDEX IF NOT EXISTS gastos_creado_en ON gastos (creado_en);


-- ============================================
-- 8. SEGURIDAD DE MOVIMIENTOS
-- RLS activado con solo una política SELECT. Sin políticas de escritura,
-- la llave anon solo puede leer; las escrituras pasan por las RPC
-- SECURITY DEFINER (dueño postgres, no sujeto a RLS).
-- ============================================

ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "turnos_leer" ON turnos;
CREATE POLICY "turnos_leer" ON turnos
    FOR SELECT TO anon, authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "ventas_leer" ON ventas;
CREATE POLICY "ventas_leer" ON ventas
    FOR SELECT TO anon, authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "venta_detalles_leer" ON venta_detalles;
CREATE POLICY "venta_detalles_leer" ON venta_detalles
    FOR SELECT TO anon, authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "gastos_leer" ON gastos;
CREATE POLICY "gastos_leer" ON gastos
    FOR SELECT TO anon, authenticated
    USING (TRUE);


-- ============================================
-- 9. TRIGGERS DE INMUTABILIDAD
-- Se aplican a cualquier rol, incluidas las RPC. Solo permiten:
--   turnos:          cerrar un turno abierto (llenar los datos de cierre)
--   ventas:          anular una venta registrada de un turno abierto
--   venta_detalles:  nada
--   gastos:          llenar eliminado_en una vez, con el turno abierto
-- Ninguna fila se puede borrar.
-- ============================================

-- --------------------------------------------
-- turnos
-- --------------------------------------------
CREATE OR REPLACE FUNCTION proteger_turnos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: los turnos no se borran';
    END IF;

    IF OLD.cerrado_en IS NOT NULL THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    -- Los datos de apertura no cambian
    IF (NEW.id, NEW.clave_apertura, NEW.abierto_por, NEW.base, NEW.abierto_en)
        IS DISTINCT FROM
       (OLD.id, OLD.clave_apertura, OLD.abierto_por, OLD.base, OLD.abierto_en) THEN
        RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: los datos de apertura no cambian';
    END IF;

    -- La coherencia del cierre la valida turnos_cierre_coherente
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_turnos ON turnos;
CREATE TRIGGER trigger_proteger_turnos
    BEFORE UPDATE OR DELETE ON turnos
    FOR EACH ROW
    EXECUTE FUNCTION proteger_turnos();

-- --------------------------------------------
-- ventas
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
        NEW.es_efectivo, NEW.efectivo_recibido, NEW.cambio)
        IS DISTINCT FROM
       (OLD.id, OLD.clave, OLD.turno_id, OLD.creado_en, OLD.total, OLD.metodo_pago_id,
        OLD.es_efectivo, OLD.efectivo_recibido, OLD.cambio) THEN
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

-- --------------------------------------------
-- venta_detalles
-- --------------------------------------------
CREATE OR REPLACE FUNCTION proteger_venta_detalles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION 'MOVIMIENTO_INMUTABLE: los detalles de venta no cambian';
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_venta_detalles ON venta_detalles;
CREATE TRIGGER trigger_proteger_venta_detalles
    BEFORE UPDATE OR DELETE ON venta_detalles
    FOR EACH ROW
    EXECUTE FUNCTION proteger_venta_detalles();

-- --------------------------------------------
-- gastos
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

    IF NOT EXISTS (
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


-- ============================================
-- 10. STORAGE
-- Bucket público 'productos' para las fotos (máx. 300 KB, solo WebP).
-- El servidor rechaza archivos más grandes o de otro tipo.
-- Las políticas solo aplican a objetos de este bucket.
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('productos', 'productos', TRUE, 307200, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "productos_fotos_leer" ON storage.objects;
CREATE POLICY "productos_fotos_leer" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'productos');

DROP POLICY IF EXISTS "productos_fotos_subir" ON storage.objects;
CREATE POLICY "productos_fotos_subir" ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'productos');

DROP POLICY IF EXISTS "productos_fotos_borrar" ON storage.objects;
CREATE POLICY "productos_fotos_borrar" ON storage.objects
    FOR DELETE TO anon, authenticated
    USING (bucket_id = 'productos');


-- ============================================
-- 11. FUNCIONES RPC DE TURNO, VENTA Y GASTO
-- Todas SECURITY DEFINER (dueño postgres, no sujeto a RLS) con
-- search_path fijo. Los errores de negocio se lanzan con
-- RAISE EXCEPTION 'CODIGO' y el cliente los traduce (src/lib/api/errores.ts).
-- Los conflictos que necesitan datos para el aviso se devuelven como
-- jsonb con la llave "resultado".
--
-- Toda escritura sobre un turno toma SELECT ... FROM turnos ... FOR UPDATE,
-- así ventas, anulaciones, gastos y cierre del mismo turno se ejecutan en
-- serie aunque vengan de varios dispositivos.
--
-- Idempotencia: cada escritura recibe una clave UUID generada por el
-- cliente. Si la clave ya existe, se devuelve el resultado original sin
-- crear otro registro. Cada función corre en una sola transacción, así
-- que una falla no deja registros parciales.
-- ============================================

-- --------------------------------------------
-- efectivo_esperado_turno: base + ventas registradas en efectivo
-- − gastos no eliminados. NULL si el turno no existe.
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
BEGIN
    SELECT base INTO v_base FROM turnos WHERE id = p_turno;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(sum(total), 0) INTO v_ventas
    FROM ventas
    WHERE turno_id = p_turno AND estado = 'registrada' AND es_efectivo;

    SELECT COALESCE(sum(valor), 0) INTO v_gastos
    FROM gastos
    WHERE turno_id = p_turno AND eliminado_en IS NULL;

    RETURN (v_base + v_ventas - v_gastos)::INTEGER;
END;
$$;

-- --------------------------------------------
-- turno_abierto: null o { id, abierto_por, abierto_en, base }
-- --------------------------------------------
CREATE OR REPLACE FUNCTION turno_abierto()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_t turnos%ROWTYPE;
BEGIN
    SELECT * INTO v_t FROM turnos WHERE cerrado_en IS NULL LIMIT 1;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', v_t.id,
        'abierto_por', v_t.abierto_por,
        'abierto_en', v_t.abierto_en,
        'base', v_t.base
    );
END;
$$;

-- --------------------------------------------
-- abrir_turno
--   { resultado: 'abierto' | 'existente', turno: { id, abierto_por, abierto_en, base } }
-- --------------------------------------------
CREATE OR REPLACE FUNCTION abrir_turno(p_clave UUID, p_persona TEXT, p_base INTEGER)
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
        OR p_persona IS NULL OR length(trim(p_persona)) NOT BETWEEN 1 AND 60
        OR p_base IS NULL OR p_base NOT BETWEEN 0 AND 99999999 THEN
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
                VALUES (p_clave, trim(p_persona), p_base)
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
-- resumen_turno (sin ventas anuladas ni gastos eliminados)
--   { turno: { id, abierto_por, abierto_en, base }, base,
--     por_metodo: [{ metodo_pago_id, nombre, es_efectivo, total, cantidad }],
--     total_ventas, total_gastos, efectivo_esperado }
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
        'efectivo_esperado', efectivo_esperado_turno(p_turno)
    );
END;
$$;

-- --------------------------------------------
-- cerrar_turno (el primer cierre gana)
--   { resultado: 'cerrado', cierre: { contado, esperado, diferencia, cerrado_en, cerrado_por } }
--   { resultado: 'ya_cerrado', cerrado_por, cerrado_en }
-- Turno inexistente → TURNO_NO_ABIERTO
-- --------------------------------------------
CREATE OR REPLACE FUNCTION cerrar_turno(p_turno UUID, p_clave UUID, p_persona TEXT, p_contado INTEGER)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_t turnos%ROWTYPE;
    v_esperado INTEGER;
BEGIN
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
                    'contado', v_t.efectivo_contado,
                    'esperado', v_t.efectivo_esperado,
                    'diferencia', v_t.diferencia,
                    'cerrado_en', v_t.cerrado_en,
                    'cerrado_por', v_t.cerrado_por
                )
            );
        END IF;
        RETURN jsonb_build_object(
            'resultado', 'ya_cerrado',
            'cerrado_por', v_t.cerrado_por,
            'cerrado_en', v_t.cerrado_en
        );
    END IF;

    IF p_clave IS NULL
        OR p_persona IS NULL OR length(trim(p_persona)) NOT BETWEEN 1 AND 60
        OR p_contado IS NULL OR p_contado NOT BETWEEN 0 AND 99999999 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- Una clave de cierre usada en otro turno
    IF EXISTS (SELECT 1 FROM turnos WHERE clave_cierre = p_clave) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- Con el bloqueo tomado, incluye todo lo confirmado antes
    v_esperado := efectivo_esperado_turno(p_turno);

    UPDATE turnos
    SET cerrado_en = NOW(),
        cerrado_por = trim(p_persona),
        clave_cierre = p_clave,
        efectivo_contado = p_contado,
        efectivo_esperado = v_esperado,
        diferencia = p_contado - v_esperado
    WHERE id = p_turno
    RETURNING * INTO v_t;

    RETURN jsonb_build_object(
        'resultado', 'cerrado',
        'cierre', jsonb_build_object(
            'contado', v_t.efectivo_contado,
            'esperado', v_t.efectivo_esperado,
            'diferencia', v_t.diferencia,
            'cerrado_en', v_t.cerrado_en,
            'cerrado_por', v_t.cerrado_por
        )
    );
END;
$$;

-- --------------------------------------------
-- registrar_venta
--   p_lineas = [{ producto_id, cantidad, precio }]  (precio = el que mostró la tarjeta)
--   → { venta_id, total, efectivo_recibido, cambio, es_efectivo, creado_en }
-- Copia nombre y precio_venta de productos. No toca inventarios.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION registrar_venta(
    p_clave UUID,
    p_turno UUID,
    p_metodo UUID,
    p_lineas jsonb,
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
               OR jsonb_typeof(l.e -> 'precio') IS DISTINCT FROM 'number'
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

        -- Productos sin repetir
        SELECT count(DISTINCT x) INTO v_n FROM unnest(v_productos) AS x;
        IF v_n <> cardinality(v_productos) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- 5. Cada producto es vendible: activo, no materia_prima, visible en Caja y con precio de venta
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

        -- 6. El precio enviado es el vigente
        IF EXISTS (
            SELECT 1
            FROM unnest(v_productos, v_precios) AS l(producto_id, precio)
            JOIN productos p ON p.id = l.producto_id
            WHERE p.precio_venta <> l.precio
        ) THEN
            RAISE EXCEPTION 'PRECIOS_ACTUALIZADOS';
        END IF;

        -- 7. Total con los precios del servidor
        SELECT sum(l.cantidad * p.precio_venta) INTO v_total
        FROM unnest(v_productos, v_cantidades) AS l(producto_id, cantidad)
        JOIN productos p ON p.id = l.producto_id;

        IF v_total IS NULL OR v_total NOT BETWEEN 0 AND 99999999 THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        -- 8. Efectivo recibido y cambio
        IF v_es_efectivo THEN
            IF p_recibido IS NULL OR p_recibido < v_total OR p_recibido > 10000000 THEN
                RAISE EXCEPTION 'RECIBIDO_INVALIDO';
            END IF;
            v_recibido := p_recibido;
        ELSE
            v_recibido := v_total::INTEGER;
        END IF;

        -- 9. Cabecera y detalles en la misma transacción
        INSERT INTO ventas (clave, turno_id, total, metodo_pago_id, es_efectivo,
                            efectivo_recibido, cambio, estado)
        VALUES (p_clave, p_turno, v_total::INTEGER, p_metodo, v_es_efectivo,
                v_recibido, v_recibido - v_total::INTEGER, 'registrada')
        RETURNING * INTO v_venta;

        INSERT INTO venta_detalles (venta_id, producto_id, nombre_producto, cantidad, precio_unitario)
        SELECT v_venta.id, l.producto_id, p.nombre, l.cantidad, p.precio_venta
        FROM unnest(v_productos, v_cantidades) AS l(producto_id, cantidad)
        JOIN productos p ON p.id = l.producto_id;
    END IF;

    -- 10. Resultado (igual en el primer registro y en los reintentos)
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
-- anular_venta
--   { resultado: 'anulada', venta: { id, total, metodo_pago_id, es_efectivo, estado,
--                                    anulada_en, anulada_por, motivo_anulacion } }
--   { resultado: 'ya_anulada', anulada_por, anulada_en, motivo }
-- --------------------------------------------
CREATE OR REPLACE FUNCTION anular_venta(p_venta UUID, p_clave UUID, p_motivo TEXT, p_persona TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_venta ventas%ROWTYPE;
    v_turno UUID;
    v_cerrado_en TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT turno_id INTO v_turno FROM ventas WHERE id = p_venta;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VENTA_NO_EXISTE';
    END IF;

    -- Bloqueo del turno y luego de la venta (mismo orden que las demás RPC)
    SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = v_turno FOR UPDATE;
    SELECT * INTO v_venta FROM ventas WHERE id = p_venta FOR UPDATE;

    -- Reintento de esta misma anulación
    IF v_venta.estado = 'anulada' AND v_venta.clave_anulacion = p_clave THEN
        RETURN jsonb_build_object(
            'resultado', 'anulada',
            'venta', jsonb_build_object(
                'id', v_venta.id,
                'total', v_venta.total,
                'metodo_pago_id', v_venta.metodo_pago_id,
                'es_efectivo', v_venta.es_efectivo,
                'estado', v_venta.estado,
                'anulada_en', v_venta.anulada_en,
                'anulada_por', v_venta.anulada_por,
                'motivo_anulacion', v_venta.motivo_anulacion
            )
        );
    END IF;

    IF v_cerrado_en IS NOT NULL THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    -- Ya anulada por otra persona o dispositivo: se conserva la primera anulación
    IF v_venta.estado = 'anulada' THEN
        RETURN jsonb_build_object(
            'resultado', 'ya_anulada',
            'anulada_por', v_venta.anulada_por,
            'anulada_en', v_venta.anulada_en,
            'motivo', v_venta.motivo_anulacion
        );
    END IF;

    IF p_clave IS NULL
        OR p_motivo IS NULL OR length(trim(p_motivo)) NOT BETWEEN 3 AND 200
        OR p_persona IS NULL OR length(trim(p_persona)) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- Una clave de anulación usada en otra venta
    IF EXISTS (SELECT 1 FROM ventas WHERE clave_anulacion = p_clave) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    UPDATE ventas
    SET estado = 'anulada',
        anulada_en = NOW(),
        anulada_por = trim(p_persona),
        motivo_anulacion = trim(p_motivo),
        clave_anulacion = p_clave
    WHERE id = p_venta
    RETURNING * INTO v_venta;

    RETURN jsonb_build_object(
        'resultado', 'anulada',
        'venta', jsonb_build_object(
            'id', v_venta.id,
            'total', v_venta.total,
            'metodo_pago_id', v_venta.metodo_pago_id,
            'es_efectivo', v_venta.es_efectivo,
            'estado', v_venta.estado,
            'anulada_en', v_venta.anulada_en,
            'anulada_por', v_venta.anulada_por,
            'motivo_anulacion', v_venta.motivo_anulacion
        )
    );
END;
$$;

-- --------------------------------------------
-- registrar_gasto
--   → { id, turno_id, valor, concepto, categoria_gasto_id, registrado_por, creado_en }
-- No bloquea si supera el efectivo disponible: esa advertencia es de la UI.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION registrar_gasto(
    p_clave UUID,
    p_turno UUID,
    p_valor INTEGER,
    p_concepto TEXT,
    p_categoria UUID,
    p_persona TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_gasto gastos%ROWTYPE;
    v_cerrado_en TIMESTAMP WITH TIME ZONE;
BEGIN
    IF p_clave IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS';
    END IF;

    -- Reintento: el gasto ya se registró
    SELECT * INTO v_gasto FROM gastos WHERE clave = p_clave;

    IF NOT FOUND THEN
        SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = p_turno FOR UPDATE;
        IF NOT FOUND OR v_cerrado_en IS NOT NULL THEN
            RAISE EXCEPTION 'TURNO_CERRADO';
        END IF;

        -- Otro reintento simultáneo pudo registrarlo mientras se esperaba el bloqueo
        SELECT * INTO v_gasto FROM gastos WHERE clave = p_clave;
    END IF;

    IF NOT FOUND THEN
        IF p_valor IS NULL OR p_valor NOT BETWEEN 1 AND 10000000
            OR p_concepto IS NULL OR length(trim(p_concepto)) NOT BETWEEN 1 AND 120
            OR p_persona IS NULL OR length(trim(p_persona)) NOT BETWEEN 1 AND 60
            OR NOT EXISTS (
                SELECT 1 FROM categorias_gasto WHERE id = p_categoria AND activo
            ) THEN
            RAISE EXCEPTION 'DATOS_INVALIDOS';
        END IF;

        INSERT INTO gastos (clave, turno_id, valor, concepto, categoria_gasto_id, registrado_por)
        VALUES (p_clave, p_turno, p_valor, trim(p_concepto), p_categoria, trim(p_persona))
        RETURNING * INTO v_gasto;
    END IF;

    RETURN jsonb_build_object(
        'id', v_gasto.id,
        'turno_id', v_gasto.turno_id,
        'valor', v_gasto.valor,
        'concepto', v_gasto.concepto,
        'categoria_gasto_id', v_gasto.categoria_gasto_id,
        'registrado_por', v_gasto.registrado_por,
        'creado_en', v_gasto.creado_en
    );
END;
$$;

-- --------------------------------------------
-- eliminar_gasto: marca eliminado_en. Si ya estaba eliminado no hace
-- nada (reintento), aunque el turno ya esté cerrado.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION eliminar_gasto(p_gasto UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_turno UUID;
    v_cerrado_en TIMESTAMP WITH TIME ZONE;
    v_eliminado_en TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT turno_id INTO v_turno FROM gastos WHERE id = p_gasto;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'GASTO_NO_EXISTE';
    END IF;

    SELECT cerrado_en INTO v_cerrado_en FROM turnos WHERE id = v_turno FOR UPDATE;
    SELECT eliminado_en INTO v_eliminado_en FROM gastos WHERE id = p_gasto FOR UPDATE;

    IF v_eliminado_en IS NOT NULL THEN
        RETURN;
    END IF;

    IF v_cerrado_en IS NOT NULL THEN
        RAISE EXCEPTION 'TURNO_CERRADO';
    END IF;

    UPDATE gastos SET eliminado_en = NOW() WHERE id = p_gasto;
END;
$$;

-- --------------------------------------------
-- Permisos: solo anon y authenticated pueden ejecutar estas funciones
-- --------------------------------------------
REVOKE ALL ON FUNCTION efectivo_esperado_turno(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION turno_abierto() FROM PUBLIC;
REVOKE ALL ON FUNCTION abrir_turno(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION resumen_turno(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION cerrar_turno(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION registrar_venta(UUID, UUID, UUID, jsonb, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION anular_venta(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION registrar_gasto(UUID, UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION eliminar_gasto(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION efectivo_esperado_turno(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION turno_abierto() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION abrir_turno(UUID, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resumen_turno(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cerrar_turno(UUID, UUID, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_venta(UUID, UUID, UUID, jsonb, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION anular_venta(UUID, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_gasto(UUID, UUID, INTEGER, TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION eliminar_gasto(UUID) TO anon, authenticated;


-- ============================================
-- 12. FUNCIONES RPC DE PIN Y REPORTES
-- Mismas reglas que la sección 11: SECURITY DEFINER (dueño postgres, no
-- sujeto a la RLS de configuracion que oculta las filas *_hash),
-- search_path fijo y errores de negocio con RAISE EXCEPTION 'CODIGO'.
--
-- PIN_Admin: se guarda solo el hash bcrypt en configuracion.clave =
-- 'admin_pin_hash'. Sin esa fila no hay PIN. El PIN nunca se guarda ni
-- se devuelve en texto claro.
--
-- Reportes: el rango de fechas locales [p_desde, p_hasta] se convierte a
-- instantes [inicio, fin) en America/Bogota:
--   inicio = p_desde 00:00 -05:00, fin = (p_hasta + 1) 00:00 -05:00.
-- Así se cubre hasta las 23:59:59.999... del día final sin perder
-- registros con fracciones de segundo. Las fechas se guardan en UTC.
-- ============================================

-- --------------------------------------------
-- pin_admin_configurado: TRUE si existe la fila admin_pin_hash
-- --------------------------------------------
CREATE OR REPLACE FUNCTION pin_admin_configurado()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM configuracion
        WHERE clave = 'admin_pin_hash' AND valor IS NOT NULL AND valor <> ''
    );
END;
$$;

-- --------------------------------------------
-- verificar_pin_admin: crypt(p_pin, hash) = hash.
-- Sin PIN configurado → TRUE. PIN nulo con PIN configurado → FALSE.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION verificar_pin_admin(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_hash TEXT;
BEGIN
    SELECT valor INTO v_hash FROM configuracion WHERE clave = 'admin_pin_hash';
    IF v_hash IS NULL OR v_hash = '' THEN
        RETURN TRUE;
    END IF;

    IF p_pin IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN COALESCE(extensions.crypt(p_pin, v_hash) = v_hash, FALSE);
END;
$$;

-- --------------------------------------------
-- cambiar_pin_admin(p_actual, p_nuevo)
--   Si hay PIN y p_actual no coincide (o es nulo) → PIN_INCORRECTO
--   p_nuevo NULL → borra la fila admin_pin_hash (quita el PIN)
--   p_nuevo que no sea de 4 a 8 dígitos 0-9 → PIN_INVALIDO
--   Si no, guarda crypt(p_nuevo, gen_salt('bf', 8))
-- Ante cualquier error el PIN guardado (o su ausencia) no cambia.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION cambiar_pin_admin(p_actual TEXT, p_nuevo TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
    v_hash TEXT;
BEGIN
    -- Serializa cambios simultáneos, también cuando aún no existe la fila
    PERFORM pg_advisory_xact_lock(hashtext('admin_pin_hash'));

    SELECT valor INTO v_hash FROM configuracion WHERE clave = 'admin_pin_hash' FOR UPDATE;

    IF v_hash IS NOT NULL AND v_hash <> '' THEN
        IF p_actual IS NULL
            OR NOT COALESCE(extensions.crypt(p_actual, v_hash) = v_hash, FALSE) THEN
            RAISE EXCEPTION 'PIN_INCORRECTO';
        END IF;
    END IF;

    IF p_nuevo IS NULL THEN
        DELETE FROM configuracion WHERE clave = 'admin_pin_hash';
        RETURN;
    END IF;

    IF p_nuevo !~ '^[0-9]{4,8}$' THEN
        RAISE EXCEPTION 'PIN_INVALIDO';
    END IF;

    INSERT INTO configuracion (clave, valor, descripcion)
    VALUES (
        'admin_pin_hash',
        extensions.crypt(p_nuevo, extensions.gen_salt('bf', 8)),
        'Hash bcrypt del PIN de Reportes'
    )
    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
END;
$$;

-- --------------------------------------------
-- reporte_rango(p_desde, p_hasta)
-- p_desde/p_hasta nulos, p_desde > p_hasta o más de 366 días → RANGO_INVALIDO
--   { ventas:    [{ id, creado_en, total, metodo_pago_id, efectivo_recibido, cambio,
--                   estado, anulada_en, anulada_por, motivo_anulacion, turno_id }]
--                 todas las del rango, incluidas anuladas
--     productos: [{ producto_id, nombre, cantidad, valor }]
--                 detalles de ventas registradas del rango, agrupados por producto;
--                 nombre = nombre_producto de la venta más reciente del rango
--     gastos:    [{ id, creado_en, valor, concepto, categoria_gasto_id, registrado_por }]
--                 no eliminados del rango
--     turnos:    [{ id, abierto_por, abierto_en, cerrado_por, cerrado_en, base,
--                   efectivo_contado, efectivo_esperado, diferencia,
--                   por_metodo: [{ metodo_pago_id, total }], total_gastos }]
--                 abiertos en el rango; por_metodo y total_gastos cubren todo el
--                 turno (sin anuladas ni eliminados); para turnos abiertos
--                 efectivo_esperado se calcula al momento
--     metodos:          [{ id, nombre, es_efectivo, activo }]  todos
--     categorias_gasto: [{ id, nombre, activo }]               todas }
-- Usa los índices ventas_creado_en, gastos_creado_en, turnos_abierto_en,
-- ventas_turno, gastos_turno y el único (venta_id, producto_id).
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

    -- Gastos no eliminados del rango
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', g.id,
                'creado_en', g.creado_en,
                'valor', g.valor,
                'concepto', g.concepto,
                'categoria_gasto_id', g.categoria_gasto_id,
                'registrado_por', g.registrado_por
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
                'total_gastos', COALESCE(tg.total_gastos, 0)
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
-- detalle_venta(p_venta)
--   { venta: { id, creado_en, total, metodo_pago_id, es_efectivo, efectivo_recibido,
--              cambio, estado, anulada_en, anulada_por, motivo_anulacion, turno_id },
--     detalles: [{ producto_id, nombre_producto, cantidad, precio_unitario, subtotal }] }
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
            ORDER BY d.nombre_producto, d.producto_id
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
            'turno_id', v_v.turno_id
        ),
        'detalles', v_detalles
    );
END;
$$;

-- --------------------------------------------
-- Permisos: solo anon y authenticated pueden ejecutar estas funciones
-- --------------------------------------------
REVOKE ALL ON FUNCTION pin_admin_configurado() FROM PUBLIC;
REVOKE ALL ON FUNCTION verificar_pin_admin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION cambiar_pin_admin(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reporte_rango(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION detalle_venta(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION pin_admin_configurado() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verificar_pin_admin(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cambiar_pin_admin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reporte_rango(DATE, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION detalle_venta(UUID) TO anon, authenticated;
