# Implementation Plan: Caja mayor y cierre a ciegas

## Overview

Orden: migración SQL → tipos y API → dominio puro → UI de Caja → Reportes → checkpoint. La migración nueva (`supabase/migration-caja-mayor.sql`) cambia las firmas de `abrir_turno`, `cerrar_turno` y `registrar_gasto`; el cliente se actualiza en esta misma entrega.

**Importante:** el usuario debe ejecutar `supabase/migration-caja-mayor.sql` a mano en el SQL Editor de Supabase, después de `supabase/migration-ventas.sql`. Hasta entonces la Caja nueva falla al abrir, cerrar o registrar gastos.

## Tasks

- [x] 1. Migración SQL `supabase/migration-caja-mayor.sql`
  - [x] 1.1 Tablas, columnas, seguridad e inmutabilidad
    - Encabezado con instrucciones (ejecutar después de `migration-ventas.sql`, idempotente)
    - Crear `caja_mayor_saldos` (fila Efectivo con `metodo_pago_id` NULL, índice único parcial), `caja_mayor_movimientos` (CHECK `movimiento_coherente`), `gasto_origenes` (índice único con `COALESCE`)
    - Insertar la Parte Efectivo y una Parte por cada método no efectivo (`WHERE NOT EXISTS` / `ON CONFLICT DO NOTHING`); trigger en `metodos_pago` que crea la Parte de métodos no efectivo nuevos
    - `ALTER TABLE turnos` con `base_siguiente`, `enviado_mayor` y `turnos_base_siguiente_coherente` (DROP IF EXISTS + ADD); `ALTER TABLE gastos ALTER COLUMN turno_id DROP NOT NULL`
    - Reemplazar `proteger_gastos` (revisar Turno solo si `OLD.turno_id` no es nulo); triggers de inmutabilidad para movimientos, orígenes y borrado de saldos
    - RLS de solo lectura en las tres tablas nuevas
    - _Requirements: 3.1, 3.2, 3.5, 11.1, 11.2, 11.3, 11.4_
  - [x] 1.2 Funciones auxiliares, fórmula y apertura/cierre
    - `mover_caja_mayor` (interna, `REVOKE` a PUBLIC, anon y authenticated; `SALDO_INSUFICIENTE: <Parte>` al fallar el CHECK), `nombre_parte`, `parte_efectivo`, `base_proximo_turno`
    - `efectivo_esperado_turno` con Parte_Cajon y retiros; `resumen_turno` con `total_retiros`
    - `DROP FUNCTION IF EXISTS abrir_turno(UUID, TEXT, INTEGER)` y nueva `abrir_turno(p_clave, p_persona)` con base automática
    - `DROP FUNCTION IF EXISTS cerrar_turno(UUID, UUID, TEXT, INTEGER)` y nueva `cerrar_turno(..., p_base_siguiente)`: guarda base y enviado, mueve efectivo y ventas no efectivo a sus Partes, responde sin esperado ni diferencia; bloqueos turno → Partes en orden de `id`
    - _Requirements: 1.4, 1.5, 1.7, 1.8, 2.1, 2.2, 3.3, 3.4, 3.6, 4.1, 4.2, 4.3, 4.4, 10.1_
  - [x] 1.3 Gastos con origen, retiros y RPC de Caja mayor
    - `DROP FUNCTION IF EXISTS registrar_gasto(UUID, UUID, INTEGER, TEXT, UUID, TEXT)` y nueva con `p_origenes jsonb` y `p_turno` opcional (`ORIGEN_INVALIDO`, `SALDO_INSUFICIENTE`)
    - `eliminar_gasto` que devuelve el dinero a las Partes (`eliminacion_gasto`) y permite eliminar Gastos_Sin_Turno
    - `registrar_retiro`, `saldos_caja_mayor`, `movimientos_caja_mayor`, `ajustar_caja_mayor`
    - `reporte_rango` con `total_retiros`, `base_siguiente`, `enviado_mayor` en turnos y `turno_id`, `origenes` en gastos
    - `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO anon, authenticated` para cada RPC pública
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 6.4, 6.5, 6.8, 7.1, 7.2, 7.3, 7.4, 8.2, 8.3, 8.4, 8.7, 8.9, 9.1, 9.2_

- [x] 2. Tipos y API del cliente
  - [x] 2.1 Códigos de error
    - Agregar `SALDO_INSUFICIENTE` y `ORIGEN_INVALIDO` a `CodigoError` y `CODIGOS_SQL` en `src/lib/api/errores.ts`; agregar `parteDeError`
    - _Requirements: 11.5_
  - [ ]* 2.2 Pruebas unitarias de `traducirError`
    - `'SALDO_INSUFICIENTE: Nequi'` → código y Parte; `'ORIGEN_INVALIDO'` → código
    - _Requirements: 11.5_
  - [x] 2.3 Turnos y gastos
    - `src/lib/api/turnos.ts`: `baseProximoTurno`, `abrirTurno(clave, persona)`, `cerrarTurno(..., baseSiguiente)`, nuevo `Cierre`, `totalRetiros` en `ResumenTurno`
    - `src/lib/api/gastos.ts`: `OrigenGasto`, `EntradaGasto` con `turnoId: string | null` y `origenes`, `gasto_origenes(parte_id, valor)` en `gastosDelTurno`, `p_origenes` en `registrarGasto`
    - _Requirements: 1.5, 2.1, 6.5, 6.9_
  - [x] 2.4 API de Caja mayor y reportes
    - Crear `src/lib/api/cajaMayor.ts` (`obtenerSaldos`, `obtenerMovimientos`, `registrarRetiro`, `ajustarCajaMayor`) y exportarlo en `src/lib/api/index.ts` si aplica
    - `src/lib/api/reportes.ts` y tipos de `src/lib/reportes/agregar.ts`: campos nuevos de turnos y gastos
    - _Requirements: 5.4, 8.2, 8.3, 8.4, 9.1, 9.2_

- [x] 3. Dominio puro
  - [x] 3.1 Actualizar `src/lib/caja/turno.ts`
    - `GastoTurno.origenes`, `MovimientosTurno.retiros`, `parteCajon`, `efectivoEsperado` nuevo, `requiereAdvertencia`, `calcularCierre`
    - _Requirements: 1.3, 1.4, 5.3, 5.5, 6.6, 6.7, 10.2_
  - [ ]* 3.2 Prueba de propiedad: cierre válido
    - **Property 1: Cierre válido y enviado a caja mayor**
    - **Validates: Requirements 1.3, 1.4**
  - [ ]* 3.3 Prueba de propiedad: fórmula del efectivo esperado
    - **Property 3: Fórmula del efectivo esperado**
    - **Validates: Requirements 5.5, 6.6, 10.2**
  - [ ]* 3.4 Prueba de propiedad: advertencia de efectivo
    - **Property 4: Advertencia de efectivo**
    - **Validates: Requirements 5.3, 6.7**
  - [x] 3.5 Crear `src/lib/caja/cajaMayor.ts`
    - `validarOrigenes`, `baseProximoTurno`, `entradasCierre`, `aplicarMovimientos`, `movimientosGasto`, `movimientosEliminacion`, `textoOrigen`
    - _Requirements: 2.1, 2.2, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 6.3, 6.4, 6.9, 7.1, 8.7, 9.2_
  - [ ]* 3.6 Prueba de propiedad: base del siguiente turno
    - **Property 2: Base del siguiente turno**
    - **Validates: Requirements 2.1, 2.2**
  - [ ]* 3.7 Prueba de propiedad: entradas del cierre
    - **Property 5: Entradas del cierre**
    - **Validates: Requirements 4.1, 4.2, 4.3**
  - [ ]* 3.8 Prueba de propiedad: validación de orígenes
    - **Property 6: Validación de orígenes**
    - **Validates: Requirements 6.3, 6.4, 8.7**
  - [ ]* 3.9 Prueba de propiedad: saldos nunca negativos
    - **Property 7: Saldos nunca negativos y saldo después encadenado**
    - **Validates: Requirements 3.2, 3.3, 3.4**
  - [ ]* 3.10 Prueba de propiedad: eliminar gasto devuelve saldos
    - **Property 8: Eliminar un gasto devuelve los saldos**
    - **Validates: Requirements 7.1**
  - [ ]* 3.11 Prueba de propiedad: texto de origen
    - **Property 9: Texto de origen**
    - **Validates: Requirements 6.9, 9.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. UI de Caja
  - [x] 5.1 Cierre a ciegas y resultado
    - `CierreTurno.tsx`: quitar resumen y vista previa; campos contado, base siguiente (prop `baseDefecto`) y persona; texto "Se enviarán $ X a caja mayor"; `cerrarTurno(..., baseSiguiente)`
    - `ResultadoCierre.tsx`: "Turno cerrado", quién y hora (`hora12`), base que quedó, enviado a caja mayor; sin Cuadra/Sobrante/Faltante
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7_
  - [x] 5.2 Apertura sin base
    - `AbrirTurno.tsx`: quitar campo de base y montos rápidos, quitar prop `baseDefecto`, mostrar `baseProximoTurno()` solo para lectura, `abrirTurno(clave, persona)`
    - _Requirements: 2.3, 2.4_
  - [ ]* 5.3 Pruebas de ejemplo de cierre y apertura
    - `CierreTurno` no muestra "Efectivo esperado" ni "Diferencia"; `ResultadoCierre` no muestra Cuadra/Sobrante/Faltante; `AbrirTurno` no tiene campo de base
    - _Requirements: 1.1, 1.6, 2.4_
  - [x] 5.4 Selector de origen y panel de gastos
    - Crear `src/components/caja/SelectorOrigenGasto.tsx` (Cajón / Efectivo / Partes / Combinado, saldos visibles, prop `permitirCajon`, faltante o sobrante en Combinado)
    - `PanelGastos.tsx`: cargar saldos, usar el selector, validar con `validarOrigenes`, advertencia sin cifras con `requiereAdvertencia(parteCajon, esperado)`, origen en la lista con `textoOrigen`, manejo de `SALDO_INSUFICIENTE` y `ORIGEN_INVALIDO`
    - _Requirements: 6.1, 6.2, 6.3, 6.7, 6.8, 6.9_
  - [x] 5.5 Retiro a caja mayor
    - Crear `src/components/caja/DialogoRetiro.tsx` (valor, persona, nota; validación; confirmación sin cifras; idempotencia; `TURNO_CERRADO`; toast)
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7_
  - [x] 5.6 Conectar en encabezado y punto de venta
    - `EncabezadoCaja.tsx`: prop `onRetiro` y botón "Retiro a caja mayor" (≥44 px, clases lz-*)
    - `PuntoVenta.tsx`: vista `'retiro'` con `DialogoRetiro`, `baseDefecto` a `CierreTurno`, quitarlo de `AbrirTurno`
    - _Requirements: 1.2, 2.3, 5.1_

- [x] 6. Reportes
  - [x] 6.1 Turnos y Gastos con columnas nuevas
    - `src/lib/reportes/agregar.ts`: `FilaTurno` con `totalRetiros`, `baseSiguiente`, `enviadoMayor`; `GastoConCategoria.origenTexto` con `textoOrigen`
    - `src/lib/reportes/tablas.ts`: columnas "Retiros", "Base dejada", "Enviado a caja mayor" en Turnos y "Origen" en Gastos
    - _Requirements: 5.8, 9.1, 9.2, 9.3, 9.4_
  - [ ]* 6.2 Prueba de propiedad: tablas consistentes
    - **Property 10: Tablas de Turnos y Gastos consistentes**
    - **Validates: Requirements 9.1, 9.3, 9.4**
  - [x] 6.3 Diálogos de ajuste y gasto sin turno
    - Crear `src/components/reportes/DialogoAjusteMayor.tsx` (Parte, Sumar/Quitar, valor, motivo 3..200, persona)
    - Crear `src/components/reportes/DialogoGastoMayor.tsx` (valor, concepto, categoría, persona, `SelectorOrigenGasto` con `permitirCajon={false}`, `registrarGasto({ turnoId: null, … })`)
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 8.9_
  - [x] 6.4 Sección Caja mayor
    - Crear `src/components/reportes/SeccionCajaMayor.tsx`: saldos por Parte y total, tabla de movimientos (12 h, más reciente primero), botones de ajuste y gasto, eliminar Gasto_Sin_Turno, recarga tras cada acción, `revisarAcceso()` antes de cada consulta
    - _Requirements: 7.4, 8.1, 8.2, 8.3, 8.8_
  - [ ]* 6.5 Prueba de propiedad: orden de movimientos
    - **Property 11: Orden de movimientos**
    - **Validates: Requirements 8.3**
  - [x] 6.6 Pestaña en el módulo
    - `NavegacionSecciones.tsx`: agregar `'caja-mayor'` ("Caja mayor")
    - `ModuloReportes.tsx`: mostrar `FiltroRango` y `SeccionCajaMayor` sin `BotonesExportar` para esa pestaña
    - _Requirements: 8.1_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ejecutar `npx tsc --noEmit`, `npm run lint`, `npm run build` y `npm test`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Ejecutar `supabase/migration-caja-mayor.sql` a mano en Supabase después de `supabase/migration-ventas.sql`; se puede repetir sin error
- Los gastos antiguos cuentan como 100 % Cajón y los Turnos cerrados antiguos abren el siguiente con `base_caja_defecto`
- Las pruebas de propiedad usan fast-check con al menos 100 corridas y la etiqueta `Feature: caja-mayor, Property N`
- La migración SQL no tiene pruebas automáticas; se revisa a mano en el SQL Editor

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3"] },
    { "id": 2, "tasks": ["1.3", "2.4", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.5"] },
    { "id": 4, "tasks": ["3.3", "3.6", "5.1", "5.2", "6.1"] },
    { "id": 5, "tasks": ["3.4", "3.7", "5.3", "5.4", "6.2"] },
    { "id": 6, "tasks": ["3.8", "5.5", "6.3"] },
    { "id": 7, "tasks": ["3.9", "5.6", "6.4"] },
    { "id": 8, "tasks": ["3.10", "6.5", "6.6"] },
    { "id": 9, "tasks": ["3.11"] }
  ]
}
```
