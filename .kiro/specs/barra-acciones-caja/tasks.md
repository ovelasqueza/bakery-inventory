# Implementation Plan: Barra de acciones, Autoconsumo y Calculadora

## Overview

Orden: migración SQL → tipos y API → dominio puro → UI de Caja → Reportes → checkpoint. La migración nueva (`supabase/migration-barra-acciones.sql`) agrega `ventas.tipo`, permite `venta_detalles.producto_id` nulo, crea las tablas de autoconsumo y agrega o reemplaza las RPC `registrar_venta_valor`, `detalle_venta`, `registrar_autoconsumo`, `anular_autoconsumo` y `reporte_rango`. `registrar_venta`, `anular_venta`, `cerrar_turno` y `efectivo_esperado_turno` no cambian.

**Importante:** el usuario debe ejecutar `supabase/migration-barra-acciones.sql` a mano en el SQL Editor de Supabase, después de `supabase/migration-ventas.sql` y `supabase/migration-caja-mayor.sql`. Hasta entonces la Calculadora y el Autoconsumo fallan al registrar, y Reportes falla al leer `tipo` y `autoconsumos` si el cliente nuevo se despliega antes.

## Tasks

- [x] 1. Migración SQL `supabase/migration-barra-acciones.sql`
  - [x] 1.1 Esquema de ventas por valor
    - Encabezado con instrucciones (ejecutar después de `migration-ventas.sql` y `migration-caja-mayor.sql`, idempotente, no borra datos)
    - `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tipo … DEFAULT 'productos'` y `ventas_tipo_valido` (DROP IF EXISTS + ADD)
    - `ALTER TABLE venta_detalles ALTER COLUMN producto_id DROP NOT NULL`, columna `orden SMALLINT`, CHECK `venta_detalles_linea_coherente` e índice único parcial `venta_detalles_orden_unico`
    - Trigger `validar_linea_venta` (`BEFORE INSERT ON venta_detalles`) que rechaza mezclar líneas con el tipo de la venta (`DATOS_INVALIDOS`)
    - Reemplazar `proteger_ventas` agregando `tipo` a las columnas que no cambian al anular
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 1.2 Tablas de autoconsumo, seguridad e inmutabilidad
    - Crear `autoconsumos` y `autoconsumo_detalles` con sus CHECK, índices y `UNIQUE (autoconsumo_id, producto_id)`
    - RLS activado con una política `FOR SELECT TO anon, authenticated` en cada tabla (DROP POLICY IF EXISTS + CREATE)
    - Triggers `proteger_autoconsumos` (solo `anulado_en` de nulo a no nulo con el Turno abierto; borrar → `MOVIMIENTO_INMUTABLE`) y `proteger_autoconsumo_detalles` (siempre `MOVIMIENTO_INMUTABLE`)
    - _Requirements: 9.3, 10.7, 13.2_
  - [x] 1.3 RPC de venta por valor y detalle
    - `registrar_venta_valor(p_clave, p_turno, p_metodo, p_valores jsonb, p_recibido)`: reintento por clave, bloqueo del Turno, método activo, 1..200 valores enteros 1..10.000.000, total ≤ 99.999.999, recibido, cabecera `tipo = 'valor'` y Lineas_Valor con `orden` en una transacción
    - `CREATE OR REPLACE detalle_venta` con `tipo` en la venta y orden `orden NULLS LAST, nombre_producto, producto_id`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.5_
  - [x] 1.4 RPC de autoconsumo, reporte y permisos
    - `registrar_autoconsumo(p_clave, p_turno, p_persona, p_nota, p_lineas jsonb)`: reintento, bloqueo del Turno, validación de persona, nota y líneas, productos vendibles (`PRODUCTO_NO_DISPONIBLE`), precio de venta vigente y `valor_referencia`; sin tocar ventas, gastos, Caja mayor ni inventarios
    - `anular_autoconsumo(p_autoconsumo)`: `AUTOCONSUMO_NO_EXISTE`, bloqueo Turno → fila, sin cambios si ya está anulado, `TURNO_CERRADO`
    - `CREATE OR REPLACE reporte_rango` copiando la versión de `migration-caja-mayor.sql` y agregando `tipo` en ventas y la lista `autoconsumos` (no anulados del rango, con líneas)
    - `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO anon, authenticated` para `registrar_venta_valor`, `detalle_venta`, `registrar_autoconsumo`, `anular_autoconsumo` y `reporte_rango`
    - _Requirements: 6.7, 6.8, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.3, 10.4, 10.5, 10.6, 11.1, 12.2, 12.7, 13.1, 13.3_

- [x] 2. Tipos y API del cliente
  - [x] 2.1 Código de error
    - Agregar `AUTOCONSUMO_NO_EXISTE` a `CodigoError` y `CODIGOS_SQL` en `src/lib/api/errores.ts`
    - _Requirements: 13.4_
  - [ ]* 2.2 Prueba unitaria de `traducirError`
    - Crear `src/lib/api/errores.test.ts`: `'AUTOCONSUMO_NO_EXISTE'` → código; un mensaje parecido con más letras (`AUTOCONSUMO_NO_EXISTE_X`) → `DESCONOCIDO`
    - _Requirements: 13.4_
  - [x] 2.3 Ventas por valor en `src/lib/api/ventas.ts`
    - `TipoVenta`, `EntradaVentaValor`, `registrarVentaValor` (RPC `registrar_venta_valor`)
    - `tipo` en `VentaTurno`, `VentaDetallada` y en el select de `ventasDelTurno` (`'productos'` si falta); `DetalleLinea.productoId: string | null`
    - _Requirements: 5.4, 6.9, 7.5_
  - [x] 2.4 API de autoconsumo
    - Crear `src/lib/api/autoconsumo.ts` con `registrarAutoconsumo`, `autoconsumosDelTurno` (select directo con `autoconsumo_detalles` embebidos, más reciente primero) y `anularAutoconsumo`, con el mismo manejo de conexión y tiempo límite que `gastos.ts`
    - Exportarlo en `src/lib/api/index.ts` si los demás módulos de API lo están
    - _Requirements: 9.3, 10.1, 10.3_
  - [x] 2.5 Tipos de reporte
    - `src/lib/reportes/agregar.ts`: `VentaReporte.tipo`, `ProductoVendido.productoId: string | null`, `AutoconsumoReporte` y `DatosReporte.autoconsumos`
    - `src/lib/api/reportes.ts`: mapear `tipo` (`'productos'` si falta), `producto_id` nulo y `autoconsumos` con sus líneas
    - _Requirements: 11.1, 11.2, 12.2_

- [x] 3. Dominio puro
  - [x] 3.1 Medidas de la barra en `src/lib/caja/layout.ts`
    - `MEDIDAS.barraAcciones = 64`, constante `BARRA`, campos `anchoBotonAccion` y `textoEnAcciones`; `altoDisponible` resta la barra de acciones
    - _Requirements: 1.3, 1.7, 1.8, 1.9_
  - [ ]* 3.2 Prueba de propiedad: medidas de la barra
    - Crear `src/lib/caja/layout.test.ts`
    - **Property 1: Medidas de la barra de acciones**
    - **Validates: Requirements 1.3, 1.7, 1.8, 1.9**
  - [x] 3.3 Crear `src/lib/caja/calculadora.ts`
    - `VALOR_MAX`, `VALORES_MAX`, `TOTAL_MAX`, `teclear`, `reducirCalculadora` (`tecla`, `agregar`, `quitar`, `vaciar`), `totalValores`, `valoresParaCobrar`, `CALCULADORA_INICIAL`
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.5, 4.6, 5.2, 5.3_
  - [ ]* 3.4 Prueba de propiedad: teclado de la Calculadora
    - Crear `src/lib/caja/calculadora.test.ts`
    - **Property 2: Teclado de la Calculadora**
    - **Validates: Requirements 3.4, 3.5, 3.7**
  - [ ]* 3.5 Prueba de propiedad: retroceso deshace un dígito
    - **Property 3: Retroceso deshace un dígito**
    - **Validates: Requirements 3.6**
  - [ ]* 3.6 Prueba de propiedad: límites al agregar
    - **Property 4: Agregar valores respeta los límites**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.6**
  - [ ]* 3.7 Prueba de propiedad: quitar es inverso de agregar
    - **Property 5: Quitar es inverso de agregar**
    - **Validates: Requirements 4.5**
  - [ ]* 3.8 Prueba de propiedad: cobrar con valor pendiente
    - **Property 6: Cobrar con valor pendiente**
    - **Validates: Requirements 5.2, 5.3**
  - [x] 3.9 Pedido de cobro en `src/lib/caja/cobro.ts`
    - `PedidoCobro`, `totalPedido`, `pedidoVacio`, `firmaPedido` (reutiliza `firmaCarrito` para productos)
    - _Requirements: 5.1, 5.4_
  - [ ]* 3.10 Prueba de propiedad: total y firma del pedido
    - Crear `src/lib/caja/cobro.test.ts`
    - **Property 7: Total y firma del pedido de cobro**
    - **Validates: Requirements 5.1, 5.4**
  - [x] 3.11 Crear `src/lib/caja/autoconsumo.ts`
    - `NOTA_MAX`, `validarAutoconsumo`, `valorReferencia`, `textoProductos`, `firmaAutoconsumo`; la selección es un `Carrito` y usa `reducirCarrito`
    - _Requirements: 8.3, 8.4, 9.1, 9.2_
  - [ ]* 3.12 Prueba de propiedad: validación del autoconsumo
    - Crear `src/lib/caja/autoconsumo.test.ts`
    - **Property 8: Validación del autoconsumo**
    - **Validates: Requirements 9.2**
  - [ ]* 3.13 Prueba de propiedad: texto de productos y valor de referencia
    - **Property 9: Texto de productos y valor de referencia**
    - **Validates: Requirements 8.4, 9.1**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. UI de Caja
  - [x] 5.1 Barra de acciones y encabezado
    - Crear `src/components/caja/BarraAccionesCaja.tsx` (`AccionCaja`, `grid-cols-6`, alto `MEDIDAS.barraAcciones`, tonos `normal`/`activo`/`peligro`, `aria-pressed`, `aria-label` y `title`; ícono + texto con `layout.textoEnAcciones`, solo ícono si no; íconos nuevos de Autoconsumo y Calculadora)
    - `EncabezadoCaja.tsx`: quitar `nav`, `BotonEncabezado` y las props de acciones; dejar logo + reloj a la izquierda y `BotonAbrirCajon` al centro
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.7, 1.8, 2.1, 2.2, 13.5_
  - [ ]* 5.2 Pruebas de ejemplo de barra y encabezado
    - Crear `src/components/caja/BarraAccionesCaja.test.tsx` (`// @vitest-environment jsdom`): 6 botones en orden, `aria-pressed` solo en el activo, sin texto visible con `textoEnAcciones = false`; `EncabezadoCaja` no tiene botones Ventas, Gastos, Retiro ni Cerrar turno
    - _Requirements: 1.1, 1.5, 1.8, 2.2_
  - [x] 5.3 Cobro para productos y valores
    - `PanelCobro.tsx`: reemplazar la prop `carrito` por `pedido: PedidoCobro`; total con `totalPedido`, clave con `firmaPedido`; registrar con `registrarVenta` o `registrarVentaValor`; `PRECIOS_ACTUALIZADOS` y `PRODUCTO_NO_DISPONIBLE` solo para productos; el resto del flujo (cajón, sin conexión, `TURNO_CERRADO`) igual
    - _Requirements: 5.1, 5.4, 5.6, 5.8, 5.9_
  - [x] 5.4 Calculadora y panel de valores
    - Crear `src/components/caja/CalculadoraVenta.tsx`: visor del Valor_Digitado encima del teclado (0–9, 000, retroceso, borrar, "Agregar"), teclas ≥ 44 px, teclado físico con la misma regla de foco que `PanelCobro`, avisos con `showToast`, scroll interno
    - Crear `src/components/caja/PanelValores.tsx`: lateral en escritorio y barra inferior expandible en móvil (como `PanelCarrito`), lista con "Quitar", "Borrar todo" con confirmación, Total_Valores, "Cobrar" y modo `soloLectura`
    - _Requirements: 3.1, 3.2, 3.3, 3.8, 4.4, 4.5, 4.6, 5.3, 13.5_
  - [x] 5.5 Panel del pedido reutilizable para autoconsumo
    - `PanelCarrito.tsx`: props opcionales `titulo`, `textoAccion`, `textoVacio` y `nota` con los valores actuales por defecto
    - _Requirements: 8.1, 8.4_
  - [x] 5.6 Registro y lista de autoconsumos
    - Crear `src/components/caja/DialogoAutoconsumo.tsx`: resumen con `textoProductos` y Valor_Referencia, `SelectorPersona` ("¿Quién lo consumió?"), nota ≤ 120, validación con `validarAutoconsumo`, `useClaveIdempotente(firmaAutoconsumo(...))`, `AvisoSinConexion`, `TURNO_CERRADO`, `PRODUCTO_NO_DISPONIBLE`, toast "Autoconsumo registrado"
    - Crear `src/components/caja/ListaAutoconsumosTurno.tsx`: patrón de `ListaVentasTurno`, total sin anulados, etiqueta "Anulado" con `hora12`, "Anular" con confirmación, recarga tras anular, `TURNO_CERRADO` y `AUTOCONSUMO_NO_EXISTE`
    - _Requirements: 9.1, 9.2, 9.5, 9.6, 9.9, 10.1, 10.2, 10.3, 13.5_
  - [x] 5.7 Ventas por valor en la lista del turno
    - `ListaVentasTurno.tsx`: etiqueta "Venta por valor" cuando `tipo = 'valor'` y `key` por índice en las líneas del detalle
    - _Requirements: 6.9_
  - [x] 5.8 Conectar todo en `PuntoVenta.tsx`
    - Vistas `autoconsumo`, `calculadora` y `cobrando-valor`; `BarraAccionesCaja` solo con turno, con la acción activa según la vista y vuelta a `vendiendo` al tocar la activa
    - Estado de la Calculadora (`reducirCalculadora` con ref) y de la Seleccion_Autoconsumo (`reducirCarrito`), separados del Pedido_Productos y conservados al cambiar de vista y con `TURNO_CERRADO`
    - Calculadora: `valoresParaCobrar` al tocar "Cobrar", `PanelCobro` con `pedido` de valor, vaciar y volver a `calculadora` al registrar, `ConfirmacionVenta`; volver a `calculadora` si la lista queda vacía en `cobrando-valor`
    - Autoconsumo: aviso y botón "Autoconsumos del turno" sobre la búsqueda, cuadrícula con las cantidades de la selección, `PanelCarrito` con textos de autoconsumo, `DialogoAutoconsumo` y `ListaAutoconsumosTurno`; `PRODUCTO_NO_DISPONIBLE` recarga el catálogo y concilia la selección con `conciliarCarrito`
    - _Requirements: 1.2, 1.5, 1.6, 1.9, 3.1, 4.7, 4.8, 5.2, 5.5, 5.7, 5.8, 8.1, 8.2, 8.5, 9.6, 9.9_
  - [ ]* 5.9 Prueba de ejemplo de la Calculadora
    - Crear `src/components/caja/CalculadoraVenta.test.tsx` (`// @vitest-environment jsdom`): el visor está antes del teclado, tocar 2, 0, 0, 0 y "Agregar" despacha las acciones esperadas
    - _Requirements: 3.2, 3.3, 4.1_

- [x] 6. Reportes
  - [x] 6.1 Agregación con tipo de venta y autoconsumo
    - `src/lib/reportes/agregar.ts`: `VentaConMetodo.tipoTexto`, orden estable de productos con `productoId` nulo, `Reporte.autoconsumo` (registros más reciente primero con `productosTexto`, `porProducto`, `porPersona`, `total`); `vacio` sin cambios
    - _Requirements: 11.1, 11.4, 12.2, 12.3, 12.7_
  - [ ]* 6.2 Prueba de propiedad: ventas por valor cuadran
    - Crear `src/lib/reportes/agregar.test.ts`
    - **Property 10: Ventas por valor cuadran en Reportes**
    - **Validates: Requirements 6.7, 11.1, 11.4**
  - [ ]* 6.3 Prueba de propiedad: agregación de autoconsumos
    - **Property 12: Agregación de autoconsumos**
    - **Validates: Requirements 12.2, 12.3**
  - [ ]* 6.4 Prueba de propiedad: autoconsumos fuera del dinero
    - **Property 14: Autoconsumos fuera del dinero**
    - **Validates: Requirements 12.7**
  - [x] 6.5 Tablas y exportación
    - `src/lib/reportes/tablas.ts`: `Seccion` con `'autoconsumo'`, columna "Tipo" en ventas registradas, anuladas y CSV, tablas "Autoconsumo", "Por producto" y "Por persona", función `seccionVacia`
    - `src/lib/reportes/exportar.ts`: `TITULO_SECCION.autoconsumo = 'Autoconsumo'`
    - _Requirements: 11.2, 12.4, 12.5, 12.6_
  - [ ]* 6.6 Prueba de propiedad: columna Tipo en Ventas
    - Crear `src/lib/reportes/tablas.test.ts`
    - **Property 11: Columna Tipo en Ventas**
    - **Validates: Requirements 11.2**
  - [ ]* 6.7 Prueba de propiedad: tablas y vacío de Autoconsumo
    - **Property 13: Tablas y vacío de la sección Autoconsumo**
    - **Validates: Requirements 12.5, 12.6**
  - [x] 6.8 Pestaña Autoconsumo y detalle de ventas
    - Crear `src/components/reportes/SeccionAutoconsumo.tsx` (aclaración "Valores a precio de venta, no es dinero recibido" y las tres tablas con `TablaReporte`)
    - `NavegacionSecciones.tsx`: `'autoconsumo'` ("Autoconsumo") entre "Métodos de pago" y "Caja mayor"
    - `ModuloReportes.tsx`: `esSeccionReporte('autoconsumo')`, `ContenidoReporte` y `BotonesExportar` con `seccionVacia`
    - `SeccionVentas.tsx`: `key` por índice en el detalle y Lineas_Valor como "Venta por valor"
    - _Requirements: 11.3, 12.1, 12.4, 12.6_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ejecutar `npx tsc --noEmit`, `npx next lint`, `npm run build` y `npm run test`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Ejecutar `supabase/migration-barra-acciones.sql` a mano en Supabase después de `supabase/migration-ventas.sql` y `supabase/migration-caja-mayor.sql`; se puede repetir sin error
- Las ventas existentes quedan como `tipo = 'productos'`; ninguna fila se borra ni se reescribe
- Las pruebas de propiedad usan fast-check con al menos 100 corridas y la etiqueta `Feature: barra-acciones-caja, Property N`
- La migración SQL no tiene pruebas automáticas; se revisa a mano en el SQL Editor
- `/login` no se toca

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.3", "2.5", "3.1", "3.3", "3.9", "3.11"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.4", "3.2", "3.4", "3.10", "3.12", "5.1", "5.3", "5.4", "5.5", "5.7", "6.1"] },
    { "id": 2, "tasks": ["1.3", "3.5", "3.13", "5.2", "5.6", "5.9", "6.2", "6.5"] },
    { "id": 3, "tasks": ["1.4", "3.6", "5.8", "6.3", "6.6", "6.8"] },
    { "id": 4, "tasks": ["3.7", "6.4", "6.7"] },
    { "id": 5, "tasks": ["3.8"] }
  ]
}
```
