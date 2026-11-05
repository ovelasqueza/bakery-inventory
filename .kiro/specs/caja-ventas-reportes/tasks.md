# Implementation Plan: Caja, ventas y reportes

## Overview

Plan en TypeScript (Next.js 14 App Router + Supabase) que sigue el diseño aprobado. El orden es: herramientas de prueba, migración SQL con sus RPC, módulos de dominio puros con sus pruebas de propiedades, capa de API, tema visual y logo, interfaz de la Caja, cambios en `/admin` y Modulo_Reportes. Cada paso deja código conectado al anterior y el último de cada bloque une las piezas en una página.

No se modifican `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/auth/*`, `src/lib/cajon.ts` ni `src/lib/supabase.ts`.

## Tasks

- [x] 1. Configurar las herramientas de prueba
  - [x] 1.1 Instalar y configurar Vitest
    - Agregar como `devDependencies`: `vitest`, `fast-check`, `jsdom`, `@testing-library/react`
    - Crear `vitest.config.ts` con alias `@` → `src`, `environment: 'node'` por defecto e `include: ['src/**/*.test.ts', 'src/**/*.test.tsx']`
    - Agregar en `package.json` el script `"test": "vitest --run"`
    - Las pruebas de componentes y hooks usan el comentario `// @vitest-environment jsdom`
    - _Requirements: 17.1_

- [x] 2. Migración de base de datos y tipos
  - [x] 2.1 Crear `supabase/migration-ventas.sql`: utilidades, parámetros y configuración
    - `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions` y función `normalizar_nombre`
    - Columnas nuevas de `productos` con `ADD COLUMN IF NOT EXISTS`: `categoria_id`, `imagen_path`, `visible_caja BOOLEAN NOT NULL DEFAULT TRUE`, `orden_caja INTEGER NOT NULL DEFAULT 0 CHECK (0..9999)`
    - Tablas `metodos_pago`, `categorias_gasto`, `personas_caja` con índices únicos sobre `normalizar_nombre(nombre)` y triggers `update_updated_at_column()`
    - Trigger `AFTER UPDATE OR DELETE` en `metodos_pago` que lanza `SIN_METODO_EFECTIVO` si no queda ningún método activo de efectivo
    - Datos iniciales con `INSERT ... WHERE NOT EXISTS`: Efectivo, Transferencia, Nequi; Insumos, Servicios, Transporte, Otros; claves `base_caja_defecto`, `cajon_al_cobrar`, `cajon_en_turno` con `ON CONFLICT (clave) DO NOTHING`
    - RLS en `configuracion` con política `FOR ALL TO anon, authenticated` que oculta las filas `clave LIKE '%\_hash'`
    - Todo con `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS` + `CREATE`, sin borrar ni renombrar nada
    - _Requirements: 4.2, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.13, 15.5, 17.2, 17.3_

  - [x] 2.2 Agregar a la migración las tablas de movimientos y el Storage
    - Tablas `turnos`, `ventas`, `venta_detalles`, `gastos` con montos `INTEGER`, `CHECK` de rangos y de coherencia (`turnos_cierre_coherente`, `ventas_pago_coherente`, `ventas_anulacion_coherente`), claves de idempotencia `UNIQUE` y `subtotal` generado
    - Índice único parcial `turnos_un_abierto` e índices por fecha y por turno
    - RLS activado con solo política `SELECT` para `anon` y `authenticated`
    - Triggers de inmutabilidad `BEFORE UPDATE OR DELETE` para `turnos`, `ventas`, `venta_detalles` y `gastos` según la tabla del diseño
    - Bucket `productos` público (300 KB, solo `image/webp`) con `ON CONFLICT DO NOTHING` y políticas `SELECT`, `INSERT`, `DELETE` limitadas a `bucket_id = 'productos'`
    - _Requirements: 2.5, 6.8, 6.10, 6.11, 7.3, 10.6, 17.2, 17.4, 17.5, 17.8, 17.9_

  - [x] 2.3 Agregar a la migración las RPC de turno, venta y gasto
    - `efectivo_esperado_turno`, `turno_abierto`, `abrir_turno`, `resumen_turno`, `cerrar_turno`, `registrar_venta`, `anular_venta`, `registrar_gasto`, `eliminar_gasto`
    - Todas `plpgsql SECURITY DEFINER SET search_path = public, extensions`, con `FOR UPDATE` del turno, errores de negocio por `RAISE EXCEPTION 'CODIGO'` y resultados `jsonb` (`abierto`, `existente`, `cerrado`, `ya_cerrado`, `anulada`, `ya_anulada`)
    - `registrar_venta` copia nombre y `round(precio_actual)` y rechaza con `PRECIOS_ACTUALIZADOS` si el precio enviado difiere; no toca inventarios
    - `REVOKE ALL ... FROM PUBLIC` y `GRANT EXECUTE ... TO anon, authenticated`
    - _Requirements: 2.4, 2.5, 3.3, 3.4, 3.8, 6.4, 6.8, 6.10, 6.11, 6.13, 6.16, 7.2, 7.5, 7.7, 8.2, 8.5, 8.8, 17.8, 17.9_

  - [x] 2.4 Agregar a la migración las RPC de PIN y reportes
    - `pin_admin_configurado`, `verificar_pin_admin`, `cambiar_pin_admin` con `crypt` y `gen_salt('bf', 8)`; códigos `PIN_INCORRECTO` y `PIN_INVALIDO`
    - `reporte_rango(p_desde, p_hasta)` con rango `[inicio, fin)` en `America/Bogota`, `RANGO_INVALIDO` y la forma de `jsonb` del diseño (ventas, productos agregados sin anuladas, gastos no eliminados, turnos con `por_metodo`, métodos y categorías incluidos inactivos)
    - `detalle_venta(p_venta)`
    - Permisos iguales a 2.3
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 15.4, 15.5, 15.9, 17.5_

  - [ ]* 2.5 Escribir `supabase/pruebas-ventas.sql`
    - Bloques `DO $$ ... ASSERT ... $$` dentro de `BEGIN; ... ROLLBACK;` con todos los casos de la tabla "Pruebas de base de datos" del diseño (doble ejecución, conteos sin cambios, apertura duplicada, idempotencia, atomicidad, inmutabilidad, primer cierre gana, método de efectivo obligatorio, PIN, límite 04:59:59/05:00:00 UTC)
    - _Requirements: 2.5, 3.8, 6.8, 6.10, 6.11, 6.13, 6.16, 7.3, 7.5, 7.7, 8.8, 12.8, 14.2, 14.8, 15.5, 17.2, 17.3, 17.5, 17.8, 17.9_

  - [x] 2.6 Actualizar `src/types/database.ts`
    - Agregar `categoria_id`, `imagen_path`, `visible_caja`, `orden_caja` a `productos.Row` (opcionales en `Insert` y `Update`)
    - Agregar tipos `Turno`, `Venta`, `VentaDetalle`, `Gasto`, `MetodoPago`, `CategoriaGasto`, `PersonaCaja`
    - Verificar que `createProducto` y el resto del código existente compilan sin cambios
    - _Requirements: 10.6, 14.6, 14.13, 17.4_

- [x] 3. Dominio de la Caja: búsqueda y validación
  - [x] 3.1 Implementar `src/lib/caja/busqueda.ts`
    - `normalizarTexto` (NFD, sin `\p{M}`, minúsculas, `trim`), tipo `ProductoCaja`, `filtrarProductos`, `compararProductos` (orden ascendente, `null` al final, nombre con `localeCompare('es')`) y `esVendible`
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7_

  - [ ]* 3.2 Escribir prueba de propiedad para `esVendible`
    - Archivo `src/lib/caja/__tests__/vendible.property.test.ts`
    - **Property 4: Solo productos vendibles en la Caja**
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 3.3 Escribir prueba de propiedad para `filtrarProductos`
    - Archivo `src/lib/caja/__tests__/filtro.property.test.ts`
    - **Property 5: Búsqueda y filtro de categoría**
    - **Validates: Requirements 4.5, 4.6**

  - [ ]* 3.4 Escribir prueba de propiedad para `compararProductos`
    - Archivo `src/lib/caja/__tests__/orden.property.test.ts`
    - **Property 6: Orden del catálogo**
    - **Validates: Requirements 4.7**

  - [x] 3.5 Implementar `src/lib/caja/validacion.ts`
    - `validarNombrePersona`, `validarEnteroEnRango` (solo `^\d+$` tras `trim`), `validarTextoLargo`, `nombreRepetido` (con `normalizarTexto`) y `puedeAplicarCambioMetodo`
    - _Requirements: 2.2, 2.6, 2.7, 3.9, 5.10, 6.7, 7.6, 8.3, 14.1, 14.2, 14.3, 14.4, 14.5, 14.9_

  - [ ]* 3.6 Escribir prueba de propiedad para textos con longitud
    - Archivo `src/lib/caja/__tests__/texto.property.test.ts`
    - **Property 1: Validación de textos con longitud**
    - **Validates: Requirements 2.2, 2.7, 3.2, 3.9, 7.2, 7.6, 8.1, 8.3, 14.9**

  - [ ]* 3.7 Escribir prueba de propiedad para enteros en rango
    - Archivo `src/lib/caja/__tests__/entero.property.test.ts`
    - **Property 2: Validación de enteros en rango**
    - **Validates: Requirements 2.6, 3.9, 5.10, 6.7, 8.3, 14.5, 14.9**

  - [ ]* 3.8 Escribir prueba de propiedad para nombres repetidos
    - Archivo `src/lib/caja/__tests__/repetido.property.test.ts`
    - **Property 3: Nombres repetidos sin distinguir mayúsculas ni tildes**
    - **Validates: Requirements 14.1, 14.3, 14.4, 14.9**

  - [ ]* 3.9 Escribir prueba de propiedad para el método de efectivo obligatorio
    - Archivo `src/lib/caja/__tests__/metodo-efectivo.property.test.ts`
    - **Property 25: Siempre queda un método de pago en efectivo activo**
    - **Validates: Requirements 14.2**

- [x] 4. Dominio de la Caja: Carrito y cobro
  - [x] 4.1 Implementar `src/lib/caja/carrito.ts`
    - `reducirCarrito` con las acciones `agregar`, `sumar`, `restar`, `fijar`, `quitar`, `vaciar`, `reemplazar` y avisos `CANTIDAD_MAXIMA` / `CANTIDAD_INVALIDA`
    - `subtotalLinea`, `totalCarrito`, `articulosCarrito`, `firmaCarrito` (independiente del orden de líneas), `conciliarCarrito`, `parsearCantidad`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.10, 5.11, 17.8_

  - [ ]* 4.2 Escribir prueba de propiedad del Carrito contra un modelo
    - Archivo `src/lib/caja/__tests__/carrito.property.test.ts`
    - **Property 7: Carrito equivalente a un modelo**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.10, 5.11**

  - [ ]* 4.3 Escribir prueba de propiedad del total del Carrito
    - Archivo `src/lib/caja/__tests__/total-carrito.property.test.ts`
    - **Property 8: Total del Carrito**
    - **Validates: Requirements 5.7, 6.11**

  - [ ]* 4.4 Escribir prueba de propiedad de `firmaCarrito`
    - Archivo `src/lib/caja/__tests__/firma.property.test.ts`
    - **Property 29: Firma del Carrito para reintentos**
    - **Validates: Requirements 17.8**

  - [x] 4.5 Implementar `src/lib/caja/cobro.ts`
    - `BILLETES`, `RECIBIDO_MAX`, `botonesRapidos`, `evaluarEfectivo` (usa `validarEnteroEnRango`) y `datosPago`
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.11_

  - [ ]* 4.6 Escribir prueba de propiedad de botones rápidos
    - Archivo `src/lib/caja/__tests__/botones.property.test.ts`
    - **Property 9: Botones de valor rápido**
    - **Validates: Requirements 6.3**

  - [ ]* 4.7 Escribir prueba de propiedad de efectivo, cambio y faltante
    - Archivo `src/lib/caja/__tests__/efectivo.property.test.ts`
    - **Property 10: Efectivo recibido, cambio y faltante**
    - **Validates: Requirements 6.4, 6.5, 6.6, 6.7, 6.11**

- [x] 5. Dominio de la Caja: turno y layout
  - [x] 5.1 Implementar `src/lib/caja/turno.ts`
    - `efectivoEsperado`, `efectivoDisponible`, `requiereAdvertenciaGasto`, `totalesPorMetodo`, `diferenciaCierre`, `clasificarDiferencia`
    - _Requirements: 3.2, 3.4, 3.5, 7.4, 8.4, 8.5, 8.6_

  - [ ]* 5.2 Escribir prueba de propiedad de Efectivo_Esperado
    - Archivo `src/lib/caja/__tests__/esperado.property.test.ts`
    - **Property 11: Efectivo_Esperado y totales por método**
    - **Validates: Requirements 3.2, 3.4, 7.4, 8.5, 8.6**

  - [ ]* 5.3 Escribir prueba de propiedad de la diferencia de cierre
    - Archivo `src/lib/caja/__tests__/diferencia.property.test.ts`
    - **Property 12: Diferencia y etiqueta del cierre**
    - **Validates: Requirements 3.4, 3.5**

  - [ ]* 5.4 Escribir prueba de propiedad de la advertencia de gasto
    - Archivo `src/lib/caja/__tests__/advertencia-gasto.property.test.ts`
    - **Property 13: Advertencia de gasto mayor al efectivo disponible**
    - **Validates: Requirements 8.4**

  - [x] 5.5 Implementar `src/lib/caja/layout.ts`
    - `LIMITES`, `MEDIDAS`, tipo `LayoutCaja` y `calcularLayout` con el algoritmo de cinco pasos del diseño (acotar entradas, modo, ancho del Carrito, columnas, ancho de tarjeta, alto disponible y `altoCarritoExpandido = floor(0,85 × alto)`)
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 5.6 Escribir prueba de propiedad del layout
    - Archivo `src/lib/caja/__tests__/layout.property.test.ts`
    - **Property 14: Layout dentro de los límites**
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.5, 9.6**

- [x] 6. Dominio de fechas, reportes y CSV
  - [x] 6.1 Implementar `src/lib/fechas/bogota.ts`
    - `diaLocal`, `horaLocal`, `fechaHoraLocal` con desplazamiento fijo de −5 h; `atajoRango`, `validarRango` (máximo 366 días), `limitesUtc`
    - _Requirements: 7.1, 8.6, 11.4, 11.7, 12.8, 12.12, 17.5_

  - [ ]* 6.2 Escribir prueba de propiedad del Dia_Local
    - Archivo `src/lib/fechas/__tests__/dia-local.property.test.ts`
    - **Property 18: Día local de Bogotá**
    - **Validates: Requirements 12.8, 17.5**

  - [ ]* 6.3 Escribir prueba de propiedad de los atajos de rango
    - Archivo `src/lib/fechas/__tests__/atajos.property.test.ts`
    - **Property 19: Atajos de rango**
    - **Validates: Requirements 11.4**

  - [ ]* 6.4 Escribir prueba de propiedad de la validación del rango
    - Archivo `src/lib/fechas/__tests__/rango.property.test.ts`
    - **Property 20: Validación del rango de fechas**
    - **Validates: Requirements 11.7, 12.12**

  - [ ]* 6.5 Escribir prueba unitaria del ejemplo 04:30 UTC
    - Archivo `src/lib/fechas/__tests__/bogota.test.ts`: un registro a las 04:30 UTC del día D queda en D−1
    - _Requirements: 17.5_

  - [x] 6.6 Implementar `src/lib/reportes/csv.ts`
    - `serializarCsv` (sin BOM, `,`, `\r\n`, comillas cuando hay `,`, `"`, `\r`, `\n` o espacios extremos; `null` vacío), `parsearCsv` (RFC 4180, ignora BOM) y `csvConBom`
    - _Requirements: 13.3, 13.4, 13.5_

  - [ ]* 6.7 Escribir prueba de propiedad de ida y vuelta del CSV
    - Archivo `src/lib/reportes/__tests__/csv.property.test.ts`
    - **Property 24: Ida y vuelta del CSV**
    - **Validates: Requirements 13.5**

  - [x] 6.8 Implementar `src/lib/reportes/agregar.ts`
    - Tipos `DatosReporte` y `Reporte`; `construirReporte` con resumen (promedio redondeado, 0 sin ventas), `porDia`, ventas y anuladas ordenadas, productos por valor y nombre, turnos con estado "Abierto", gastos y totales por categoría y método (incluidos inactivos) y `vacio`
    - _Requirements: 7.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.9, 12.10_

  - [ ]* 6.9 Escribir prueba de propiedad del reporte contra un modelo
    - Archivo `src/lib/reportes/__tests__/reporte.property.test.ts`
    - **Property 21: Reporte equivalente a un modelo**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.10**

  - [ ]* 6.10 Escribir prueba de propiedad de sumas consistentes
    - Archivo `src/lib/reportes/__tests__/sumas.property.test.ts`
    - **Property 22: Sumas consistentes del reporte**
    - **Validates: Requirements 12.9, 7.4**

  - [x] 6.11 Implementar `src/lib/reportes/tablas.ts`
    - Tipos `Seccion`, `Celda`, `Tabla`; `tablasDeSeccion(r, s, 'pantalla' | 'csv')` (montos con `formatCurrency` en pantalla y enteros en CSV; fechas `AAAA-MM-DD HH:mm`; Ventas con columna Estado, motivo y persona en CSV; Resumen con una fila por indicador) y `nombreArchivo`
    - _Requirements: 12.2, 13.2, 13.3, 13.4, 13.5_

  - [ ]* 6.12 Escribir prueba de propiedad de tablas de pantalla y CSV
    - Archivo `src/lib/reportes/__tests__/tablas.property.test.ts`
    - **Property 23: CSV con la misma tabla que la pantalla**
    - **Validates: Requirements 13.2, 13.3, 13.4**

- [x] 7. Dominio de fotos y PIN
  - [x] 7.1 Implementar `src/lib/imagen/procesarFoto.ts`
    - `FOTO`, `TIPOS`, `dimensionesReducidas`, `elegirCalidad` (0,8 → 0,5; `SIN_WEBP`, `PESADA`) y `procesarFoto` con `createImageBitmap(..., { imageOrientation: 'from-image' })`, `canvas` y codificador inyectable; errores `FORMATO`, `DANADO`, `GRANDE`
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

  - [ ]* 7.2 Escribir prueba de propiedad de dimensiones reducidas
    - Archivo `src/lib/imagen/__tests__/dimensiones.property.test.ts`
    - **Property 15: Reducción de fotos sin recorte ni ampliación**
    - **Validates: Requirements 10.2**

  - [ ]* 7.3 Escribir prueba de propiedad de la validación del archivo
    - Archivo `src/lib/imagen/__tests__/archivo.property.test.ts`
    - **Property 16: Validación del archivo de foto**
    - **Validates: Requirements 10.3**

  - [ ]* 7.4 Escribir prueba de propiedad de la elección de calidad
    - Archivo `src/lib/imagen/__tests__/calidad.property.test.ts`
    - **Property 17: Elección de calidad WebP**
    - **Validates: Requirements 10.4, 10.5**

  - [x] 7.5 Implementar `src/lib/seguridad/pin.ts`
    - `PIN`, `EstadoIntentos`, `registrarFallo`, `registrarExito`, `estaBloqueado`, `accesoVigente`, `validarPinNuevo`
    - _Requirements: 15.2, 15.3, 15.4, 15.7, 15.9_

  - [ ]* 7.6 Escribir prueba de propiedad de intentos y bloqueo
    - Archivo `src/lib/seguridad/__tests__/intentos.property.test.ts`
    - **Property 26: Intentos de PIN y bloqueo**
    - **Validates: Requirements 15.3, 15.7**

  - [ ]* 7.7 Escribir prueba de propiedad de vigencia del acceso
    - Archivo `src/lib/seguridad/__tests__/vigencia.property.test.ts`
    - **Property 27: Vigencia del acceso con PIN**
    - **Validates: Requirements 15.2**

  - [ ]* 7.8 Escribir prueba de propiedad del formato del PIN
    - Archivo `src/lib/seguridad/__tests__/formato-pin.property.test.ts`
    - **Property 28: Formato del PIN nuevo**
    - **Validates: Requirements 15.4, 15.9**

- [x] 8. Checkpoint: dominio puro
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Capa de API
  - [x] 9.1 Implementar `src/lib/api/errores.ts`
    - `CodigoError`, `ErrorApp` y `llamarRpc(nombre, args, ms = 15_000)`: `navigator.onLine === false` → `SIN_CONEXION` sin llamar; `abortSignal(AbortSignal.timeout(ms))`; abortos y `Failed to fetch` → `SIN_CONEXION`; mensajes con código conocido → ese código; `23505` → `NOMBRE_REPETIDO`; resto → `DESCONOCIDO`
    - _Requirements: 6.12, 17.6, 17.7_

  - [ ]* 9.2 Escribir pruebas unitarias de `llamarRpc`
    - Archivo `src/lib/api/__tests__/errores.test.ts`: sin conexión no llama a Supabase; con temporizadores falsos aborta a los 15 s; traducción de códigos
    - _Requirements: 6.12, 17.7_

  - [x] 9.3 Implementar `src/lib/api/turnos.ts`
    - `obtenerTurnoAbierto`, `abrirTurno`, `resumenTurno`, `cerrarTurno` sobre `llamarRpc`
    - _Requirements: 2.4, 2.5, 2.10, 3.2, 3.3, 3.8_

  - [x] 9.4 Implementar `src/lib/api/ventas.ts`
    - `obtenerCatalogoCaja` (una sola consulta filtrada, `Math.round(precio_actual)`, sin listas parciales), `registrarVenta`, `ventasDelTurno`, `anularVenta`, `detalleVenta`
    - _Requirements: 4.1, 4.2, 4.10, 6.8, 6.12, 7.1, 7.2, 7.7, 7.8_

  - [x] 9.5 Implementar `src/lib/api/gastos.ts`
    - `gastosDelTurno` (sin eliminados), `registrarGasto`, `eliminarGasto`
    - _Requirements: 8.2, 8.5, 8.6, 8.7, 8.8_

  - [x] 9.6 Implementar `src/lib/api/parametros.ts`
    - `obtenerParametrosCaja`, CRUD de `metodos_pago`, `categorias_gasto`, `personas_caja` (sin borrar, solo desactivar), `guardarConfig`, `productosConfigurables`, `actualizarProductoCaja`, lista de `categorias`
    - _Requirements: 2.2, 2.3, 6.2, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.12, 14.13_

  - [x] 9.7 Implementar `src/lib/api/reportes.ts` y `src/lib/api/pin.ts`
    - `obtenerReporte(rango)` → `DatosReporte`; `pinConfigurado`, `verificarPin` (10 s), `cambiarPin(actual, nuevo | null)`
    - _Requirements: 12.11, 12.13, 15.1, 15.4, 15.5, 15.8, 15.9_

  - [x] 9.8 Implementar `src/lib/api/fotos.ts`
    - `subirFotoProducto` (ruta `{productoId}-{ms}.webp`, `cacheControl: '31536000'`, 30 s, limpieza del archivo nuevo si falla, borrado del anterior ignorando su error), `quitarFotoProducto`, `urlFoto`
    - _Requirements: 10.6, 10.7, 10.8, 10.11_

  - [ ]* 9.9 Escribir pruebas unitarias de `fotos.ts`
    - Archivo `src/lib/api/__tests__/fotos.test.ts` con Storage simulado: falla de `update` borra el archivo nuevo; falla del borrado del anterior no lanza error
    - _Requirements: 10.7, 10.8_

- [x] 10. Tema visual y logo
  - [x] 10.1 Extender `tailwind.config.ts`
    - Agregar en `theme.extend` los colores `lz.*`, las familias `lz-sans` y `lz-display` y las sombras `lz-soft`, `lz-card`, `lz-float` del diseño, sin cambiar valores existentes
    - _Requirements: 16.1, 16.5_

  - [x] 10.2 Crear `src/lib/marca/fuentes.ts`
    - `Plus_Jakarta_Sans` y `Space_Grotesk` de `next/font/google` con variables `--font-lz-sans` y `--font-lz-display`, `display: 'swap'` y fuentes de respaldo del sistema
    - _Requirements: 16.1, 16.5, 16.6_

  - [x] 10.3 Crear el logo SVG
    - `public/logo-lizpan.svg` y copia idéntica en `diseno/logo/logo-lizpan.svg`, `viewBox="0 0 320 160"`, texto "LIZPAN", óvalos, gorro, hogaza y espigas solo con colores de la paleta, `<title>Panadería LIZPAN</title>`, sin `<image>`
    - _Requirements: 16.3_

  - [x] 10.4 Crear `src/components/marca/LogoLizpan.tsx`
    - `<img src="/logo-lizpan.svg">` con `alto` acotado a 32..64 px y `width: auto`; si `onError`, muestra el texto "Panadería LIZPAN"
    - _Requirements: 16.4, 16.7_

  - [ ]* 10.5 Escribir prueba estática del logo
    - Archivo `src/components/marca/__tests__/logo.test.ts`: el SVG contiene `LIZPAN`, no contiene `<image`, todos los `fill` y `stroke` están en la paleta y las dos copias son iguales
    - _Requirements: 16.3_

- [x] 11. Checkpoint: API y tema
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Caja: estructura y hooks
  - [x] 12.1 Crear `src/app/caja/layout.tsx`
    - Server component que importa `fuentes.ts`, envuelve `children` en el `div` con variables de fuente, `font-lz-sans bg-lz-linen text-lz-charcoal antialiased` y define los metadatos "Caja | LIZPAN"
    - _Requirements: 1.1, 1.3, 16.1, 16.5, 16.6_

  - [x] 12.2 Implementar `src/hooks/caja/useLayoutCaja.ts`
    - `calcularLayout(window.innerWidth, window.innerHeight)` en `useLayoutEffect`; escucha `resize` y `orientationchange` y recalcula una vez 150 ms después del último evento; devuelve `null` en el servidor
    - _Requirements: 9.1, 9.2, 9.9, 9.10_

  - [ ]* 12.3 Escribir prueba unitaria de `useLayoutCaja`
    - Archivo `src/hooks/caja/__tests__/useLayoutCaja.test.tsx` (jsdom, temporizadores falsos): una serie de `resize` produce un solo recálculo antes de 200 ms
    - _Requirements: 9.2_

  - [x] 12.4 Implementar `useTurnoCaja`, `useCatalogoCaja`, `useBusquedaDiferida` y `useClaveIdempotente`
    - Archivos separados en `src/hooks/caja/`; `useTurnoCaja` refresca en `visibilitychange` y `focus`; `useBusquedaDiferida` aplica el texto a los 150 ms; `useClaveIdempotente(firma)` cambia el `crypto.randomUUID()` solo cuando cambia la firma
    - _Requirements: 1.7, 2.1, 4.1, 4.5, 4.10, 7.4, 14.10, 17.8_

  - [x] 12.5 Implementar `src/hooks/caja/useCajon.ts`
    - `abrirSiCorresponde('cobro_efectivo' | 'turno')` lee `cajon_al_cobrar` / `cajon_en_turno`, no llama al agente si está desactivado y, si `abrirCajonSinPapel()` da `false`, muestra el aviso "El cajón no se abrió"
    - _Requirements: 2.8, 2.9, 3.6, 3.10, 6.14, 14.7, 14.11_

  - [ ]* 12.6 Escribir prueba unitaria de `useCajon`
    - Archivo `src/hooks/caja/__tests__/useCajon.test.tsx`: las cuatro combinaciones de opción y evento, y el aviso cuando el agente devuelve `false`
    - _Requirements: 2.9, 14.11_

- [x] 13. Caja: componentes y pantalla de ventas
  - [x] 13.1 Crear `SelectorPersona`, `AvisoSinConexion` y `EncabezadoCaja`
    - En `src/components/caja/`; `EncabezadoCaja` con `LogoLizpan`, Persona_Caja y hora de apertura, reloj y botones "Ventas", "Gastos", "Cerrar turno", "Administración"; `AvisoSinConexion` con "Reintentar"
    - Solo clases de color `lz-*` y botones de al menos 44 × 44 px
    - _Requirements: 1.6, 2.2, 3.1, 9.8, 16.1, 16.2, 16.4, 17.7_

  - [x] 13.2 Crear `AbrirTurno`
    - `SelectorPersona` y campo Base_Caja precargado con `base_caja_defecto`; validación con `validarNombrePersona` y `validarEnteroEnRango(0, 99_999_999)`; errores por campo conservando valores; manejo de `existente` (aviso con persona y hora), `SIN_CONEXION` y otros errores; cajón al abrir
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 17.7, 17.8_

  - [x] 13.3 Crear `BarraBusqueda`, `CuadriculaProductos`, `TarjetaProducto`, `ImagenProducto` y `EstadoVacioCaja`
    - Buscador `maxLength=50`, cinta de categorías con "Todas" primero, cuadrícula `repeat(columnas, 1fr)`, tarjeta-botón con foto 4:3, `line-clamp-2` y `formatCurrency`; reemplazo con inicial en mayúscula; estados vacíos "sin coincidencias" (con "Limpiar búsqueda") y "sin productos vendibles"; error con "Reintentar"
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.8, 4.9, 4.10, 9.6, 9.8, 10.11_

  - [x] 13.4 Crear `PanelCarrito`
    - Escritorio: panel derecho de `anchoCarrito`; móvil: barra fija de 64 px con total y artículos que se expande hasta `altoCarritoExpandido` con botón "Contraer"; líneas con `-`, campo de cantidad (restaura y avisa si es inválida), `+` y eliminar; "Vaciar" con confirmación; total y "Cobrar" deshabilitado sin líneas; aviso de cantidad máxima
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 5.10, 5.11, 6.1, 9.3, 9.4, 9.5, 9.7, 9.8, 9.10_

  - [x] 13.5 Crear `PanelCobro` y `ConfirmacionVenta`
    - Total, botones de Metodo_Pago activos en orden, campo de efectivo con `evaluarEfectivo` y `botonesRapidos`, cambio o faltante; confirmar deshabilitado mientras registra con indicador de progreso; clave con `useClaveIdempotente(firma de Carrito + método + recibido)`; manejo de `SIN_CONEXION` con reintento, `TURNO_CERRADO`, `PRECIOS_ACTUALIZADOS` (con `conciliarCarrito`), `PRODUCTO_NO_DISPONIBLE`, `METODO_INVALIDO`; cajón al cobrar en efectivo; confirmación que se cierra a los 3 s o al tocar
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.12, 6.13, 6.14, 6.15, 17.7, 17.8_

  - [ ]* 13.6 Escribir pruebas unitarias de `PanelCobro` y `ConfirmacionVenta`
    - Archivo `src/components/caja/__tests__/cobro.test.tsx` (jsdom): doble clic en confirmar llama a `registrarVenta` una sola vez; un reintento usa la misma clave; la confirmación se cierra a los 3 s
    - _Requirements: 6.9, 6.15, 17.8_

  - [x] 13.7 Crear `ListaVentasTurno` y `DialogoAnulacion`
    - Lista del turno de la más reciente a la más antigua con hora HH:mm, total, método y estado; etiqueta "Anulada" sin opción de anular; diálogo con motivo (3..200) y Persona_Caja; manejo de `ya_anulada`, `TURNO_CERRADO` y `SIN_CONEXION` conservando datos; refresca los totales al anular
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6, 7.7, 7.8, 17.7_

  - [x] 13.8 Crear `PanelGastos`
    - Formulario de valor, concepto, Categoria_Gasto activa y Persona_Caja con errores por campo; advertencia con `requiereAdvertenciaGasto` y confirmación; lista del más reciente al más antiguo con total; eliminar con confirmación; manejo de `TURNO_CERRADO`, `SIN_CONEXION` y otros errores con clave idempotente
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 17.7, 17.8_

  - [x] 13.9 Crear `CierreTurno` y `ResultadoCierre`
    - Resumen con Base_Caja, totales por método, gastos y Efectivo_Esperado de `resumenTurno`; campo de efectivo contado vacío y Persona_Caja; errores por campo; manejo de `ya_cerrado` y `SIN_CONEXION`; "Cancelar" vuelve a ventas sin cambios; resultado con contado, esperado, `|diferencia|` y etiqueta "Cuadra/Sobrante/Faltante"; cajón al cerrar
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 17.7, 17.8_

  - [x] 13.10 Crear `PuntoVenta` y `src/app/caja/page.tsx`
    - `PuntoVenta` implementa la máquina de estados (Cargando, ErrorCarga, SinTurno, Vendiendo, Cobrando, Cerrando, ResumenCierre), contiene `useReducer` del Carrito, usa `useLayoutCaja` con contenedor `fixed inset-0`, `height: altoVentana` y `overflow: hidden`, abre los paneles de Ventas y Gastos sobre Vendiendo, pasa a SinTurno ante `TURNO_CERRADO` conservando el Carrito y pide confirmación al ir a `/admin` con Carrito no vacío
    - `page.tsx` (`'use client'`) renderiza `<PuntoVenta />`
    - _Requirements: 1.1, 1.6, 1.7, 1.8, 2.1, 4.1, 5.1, 5.2, 6.13, 7.4, 8.8, 9.1, 9.7, 9.9, 9.10, 16.2_

  - [ ]* 13.11 Escribir prueba estática de clases de color de la Caja
    - Archivo `src/components/caja/__tests__/clases-color.test.ts`: las clases de color de `src/components/caja/**` usan solo el prefijo `lz-` (con excepciones explícitas como `bg-transparent`)
    - _Requirements: 16.1_

- [x] 14. Checkpoint: Caja
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Cambios en Administración y PWA
  - [x] 15.1 Agregar botones en `src/app/admin/page.tsx`
    - En el encabezado, visibles sin desplazar: "Ir a Caja" (`/caja`) y "Reportes" (`/admin/reportes`) con `next/link`; el resto de la página no cambia
    - _Requirements: 1.5, 11.1, 11.2_

  - [x] 15.2 Crear `src/components/productos/FotoProducto.tsx`
    - Vista previa, subir/reemplazar con `procesarFoto` y `subirFotoProducto`, quitar con confirmación y `quitarFotoProducto`; indicador de progreso y botones deshabilitados mientras procesa o sube; mensajes de error por código (`FORMATO`, `DANADO`, `GRANDE`, `SIN_WEBP`, `PESADA`, fallo de subida)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_

  - [x] 15.3 Integrar `FotoProducto` en `ProductoForm.tsx`
    - Mostrar el bloque solo al editar un producto que no es `materia_prima`; crear producto no cambia
    - _Requirements: 10.1_

  - [x] 15.4 Agregar el acceso directo a `public/manifest.json`
    - Solo la clave `shortcuts` con "Caja" → `/caja` e icono existente; el resto del manifiesto sin cambios
    - _Requirements: 1.4_

  - [ ]* 15.5 Escribir prueba estática del manifiesto
    - Archivo `src/__tests__/manifest.test.ts`: existe el shortcut "Caja" → `/caja` y `name`, `icons`, `start_url` y colores no cambiaron
    - _Requirements: 1.4_

- [x] 16. Modulo_Reportes
  - [x] 16.1 Crear `src/app/admin/reportes/layout.tsx`
    - Mismas fuentes, contenedor y tema `lz` que la Caja; metadatos "Reportes | LIZPAN"
    - _Requirements: 16.1, 16.5, 16.6_

  - [x] 16.2 Crear `src/components/reportes/GuardaPin.tsx`
    - Si hay PIN y `accesoVigente` es falso, muestra solo el campo de PIN; guarda intentos en `localStorage['lz_pin_intentos']` y la marca en `sessionStorage['lz_pin_ok']`; muestra intentos restantes y tiempo de bloqueo; error de RPC o 10 s no cuenta como fallo; expone una función para revisar `accesoVigente` antes de cada consulta
    - _Requirements: 15.1, 15.2, 15.3, 15.5, 15.6, 15.7, 15.8_

  - [ ]* 16.3 Escribir pruebas unitarias de `GuardaPin`
    - Archivo `src/components/reportes/__tests__/GuardaPin.test.tsx` (jsdom): error de RPC no cuenta como intento; sin PIN configurado muestra el contenido; PIN correcto reinicia los intentos
    - _Requirements: 15.2, 15.6, 15.8_

  - [x] 16.4 Crear `FiltroRango`, `NavegacionSecciones` y `EstadoVacioReporte`
    - Fechas desde/hasta con atajos de `atajoRango`, error junto al filtro con `validarRango` sin consultar; siete pestañas con la activa resaltada; "Sin movimientos en este rango"
    - _Requirements: 11.3, 11.4, 11.7, 12.10, 12.12_

  - [x] 16.5 Crear las secciones de reporte
    - `SeccionResumen`, `SeccionVentas` (por día, registradas, anuladas aparte y detalle de una venta seleccionada con `detalleVenta`), `SeccionProductos`, `SeccionTurnos`, `SeccionGastos`, `SeccionMetodos`, todas a partir de `tablasDeSeccion(reporte, seccion, 'pantalla')`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.10_

  - [x] 16.6 Implementar la exportación y `BotonesExportar`
    - `src/lib/reportes/exportar.ts`: CSV con `csvConBom` y descarga por `<a download>`; PDF con `jsPDF` (carta horizontal), logo SVG rasterizado a PNG en `canvas` (texto "Panadería LIZPAN" si falla), sección, rango, "Generado" en Bogotá y una `autoTable` por `Tabla`; `doc.save(nombreArchivo(...))` solo al final
    - `BotonesExportar`: "Descargar PDF" y "Descargar CSV", deshabilitados con estado vacío, mensaje "No se pudo generar el archivo" sin descarga parcial
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6, 13.7_

  - [ ]* 16.7 Escribir prueba unitaria del PDF
    - Archivo `src/lib/reportes/__tests__/exportar.test.ts` (jsdom): con 200 filas el documento tiene más de una página e incluye el nombre de la sección y el rango
    - _Requirements: 13.2_

  - [x] 16.8 Crear `ConfigMetodosPago`, `ConfigCategoriasGasto` y `ConfigPersonas`
    - Crear, editar, activar, desactivar (sin borrar) y ordenar métodos; validación con `validarTextoLargo`, `nombreRepetido`, `validarEnteroEnRango(0, 999)` y `puedeAplicarCambioMetodo`; manejo de `NOMBRE_REPETIDO`, `SIN_METODO_EFECTIVO` y errores de conexión conservando el valor escrito; confirmación de guardado
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.8, 14.9, 14.10, 14.12_

  - [x] 16.9 Crear `ConfigBaseCaja`, `ConfigCajon` y `ConfigPin`
    - Base por defecto 0..10.000.000; dos interruptores de cajón independientes; crear, cambiar o quitar PIN pidiendo el actual, con `validarPinNuevo` y manejo de `PIN_INCORRECTO` / `PIN_INVALIDO`
    - _Requirements: 14.5, 14.7, 14.9, 14.10, 14.12, 15.4, 15.9_

  - [x] 16.10 Crear `ConfigProductosCaja`
    - Lista de productos que no son `materia_prima` con visible en Caja, orden 0..9999, categoría de la tabla `categorias` (o sin categoría) y `FotoProducto`
    - _Requirements: 10.1, 14.6, 14.9, 14.12, 14.13_

  - [x] 16.11 Crear `SeccionConfiguracion`, `ModuloReportes` y `src/app/admin/reportes/page.tsx`
    - `SeccionConfiguracion` reúne los subpaneles de 16.8, 16.9 y 16.10
    - `ModuloReportes`: encabezado con `LogoLizpan` y "Volver a Administración"; abre en Resumen con rango Hoy; conserva el rango al cambiar de sección; carga `obtenerReporte` con número de petición para descartar respuestas viejas; indicador de carga; error con "Reintentar" sin cifras parciales; revisa `accesoVigente` antes de cada consulta; `BotonesExportar` en todas las secciones menos Configuración
    - `page.tsx` (`'use client'`) renderiza `<GuardaPin><ModuloReportes /></GuardaPin>`
    - _Requirements: 11.2, 11.3, 11.5, 11.6, 11.7, 12.11, 12.13, 13.1, 15.1, 15.2, 16.4_

  - [ ]* 16.12 Escribir prueba estática de clases de color de Reportes
    - Archivo `src/components/reportes/__tests__/clases-color.test.ts`: las clases de color de `src/components/reportes/**` usan solo el prefijo `lz-`
    - _Requirements: 16.1_

- [x] 17. Verificación final
  - [x] 17.1 Verificar archivos protegidos, compilación y lint
    - `git diff --stat` contra la rama base: `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` y `src/components/auth/*` sin cambios
    - Ejecutar `npm run test`, `npm run build` y `npm run lint` y corregir los errores encontrados
    - _Requirements: 1.2, 16.5, 17.1_

- [x] 18. Checkpoint final
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales (pruebas) y se pueden saltar para un MVP más rápido.
- **La migración `supabase/migration-ventas.sql` se debe ejecutar a mano en el SQL Editor de Supabase** antes de probar la Caja o los Reportes en el despliegue. Se puede ejecutar dos veces sin error. `supabase/pruebas-ventas.sql` también se ejecuta a mano y termina en `ROLLBACK`, así que no deja datos.
- Decisiones aceptadas del diseño: `orden_caja` con valor por defecto 0, RLS en `configuracion` que oculta las filas `*_hash`, PIN_Admin como barrera de interfaz y CSV sin neutralizar fórmulas.
- Cada tarea cita los criterios de aceptación que cubre. Las pruebas de propiedades usan `fast-check` con al menos 100 casos y el comentario `// Feature: caja-ventas-reportes, Property N: ...`.
- Las pruebas manuales del diseño (tamaños de pantalla, capturas de `/login` y `/`, tiempo de reportes, Agente_Cajon apagado, acceso directo de la PWA) quedan fuera de este plan porque no se pueden hacer con código.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.6"] },
    { "id": 1, "tasks": ["2.2", "3.1", "6.1", "6.6", "7.1", "7.5", "9.1", "10.1", "10.2", "10.3"] },
    { "id": 2, "tasks": ["2.3", "3.2", "3.3", "3.4", "3.5", "4.1", "4.5", "5.1", "5.5", "6.2", "6.3", "6.4", "6.5", "6.7", "6.8", "7.2", "7.3", "7.4", "7.6", "7.7", "7.8", "9.2", "10.4"] },
    { "id": 3, "tasks": ["2.4", "3.6", "3.7", "3.8", "3.9", "4.2", "4.3", "4.4", "4.6", "4.7", "5.2", "5.3", "5.4", "5.6", "6.9", "6.10", "6.11", "10.5"] },
    { "id": 4, "tasks": ["2.5", "6.12", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8"] },
    { "id": 5, "tasks": ["9.9", "12.1", "12.2", "12.4", "12.5", "15.1", "15.2", "15.4", "16.1"] },
    { "id": 6, "tasks": ["12.3", "12.6", "13.1", "13.3", "15.3", "15.5", "16.2", "16.4", "16.6"] },
    { "id": 7, "tasks": ["13.2", "13.4", "13.5", "13.7", "13.8", "13.9", "16.3", "16.5", "16.7", "16.8", "16.9", "16.10"] },
    { "id": 8, "tasks": ["13.6", "13.10", "16.11"] },
    { "id": 9, "tasks": ["13.11", "16.12"] },
    { "id": 10, "tasks": ["17.1"] }
  ]
}
```
