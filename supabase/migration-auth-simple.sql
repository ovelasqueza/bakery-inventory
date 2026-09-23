-- ============================================
-- MIGRACIÓN: Sistema de autenticación simple
-- Ejecutar este script en el SQL Editor de Supabase
-- ============================================

-- ============================================
-- PASO 1: Crear la función de verificación
-- (Este paso es seguro para GitHub)
-- ============================================
CREATE OR REPLACE FUNCTION verificar_password(password_intento TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  hash_almacenado TEXT;
  hash_intento TEXT;
BEGIN
  -- Obtener el hash almacenado
  SELECT valor INTO hash_almacenado
  FROM configuracion
  WHERE clave = 'app_password_hash';
  
  -- Si no existe configuración, denegar acceso
  IF hash_almacenado IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Calcular hash del intento
  hash_intento := encode(sha256(password_intento::bytea), 'hex');
  
  -- Comparar hashes
  RETURN hash_almacenado = hash_intento;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Dar permisos para ejecutar la función
GRANT EXECUTE ON FUNCTION verificar_password(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verificar_password(TEXT) TO authenticated;

-- ============================================
-- PASO 2: CONFIGURAR CONTRASEÑA (NO SUBIR A GITHUB)
-- ============================================
-- Ejecuta este comando EN SUPABASE DIRECTAMENTE,
-- reemplazando 'TU_CONTRASEÑA_SEGURA' con tu contraseña real:
--
-- INSERT INTO configuracion (clave, valor, descripcion)
-- VALUES (
--   'app_password_hash',
--   encode(sha256('TU_CONTRASEÑA_SEGURA'::bytea), 'hex'),
--   'Hash SHA-256 de la contraseña de acceso a la aplicación'
-- )
-- ON CONFLICT (clave) DO UPDATE SET 
--   valor = encode(sha256('TU_CONTRASEÑA_SEGURA'::bytea), 'hex');
--
-- ============================================

-- ============================================
-- PARA CAMBIAR LA CONTRASEÑA DESPUÉS:
-- ============================================
-- UPDATE configuracion 
-- SET valor = encode(sha256('NUEVA_CONTRASEÑA'::bytea), 'hex')
-- WHERE clave = 'app_password_hash';
-- ============================================

-- Verificar que la función se creó correctamente
SELECT proname FROM pg_proc WHERE proname = 'verificar_password';
