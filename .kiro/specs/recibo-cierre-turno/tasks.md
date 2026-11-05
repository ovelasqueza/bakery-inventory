# Implementation Plan: Recibo de cierre de turno

## Overview

Orden: migración SQL → API → dominio puro del recibo → cliente del agente y orquestación → agente PowerShell → UI → checkpoint. La migración nueva (`supabase/migration-recibo-cierre.sql`) solo agrega la RPC `recibo_cierre`; no cambia tablas ni otras funciones.

**Importante:** el usuario debe ejecutar `supabase/migration-recibo-cierre.sql` a mano en el SQL Editor de Supabase, después de `migration-ventas.sql`, `migration-caja-mayor.sql` y `migration-barra-acciones.sql`. También debe actualizar el agente en el equipo de la caja (copiar `herramientas/cajon` y ejecutar `instalar.cmd`). Hasta entonces el cierre funciona, pero el recibo muestra el aviso de fallo.

## Tasks

- [x] 1. Datos del recibo
  - [x] 1.1 Migración `supabase/migration-recibo-cierre.sql`
    - Encabezado con instrucciones (orden de ejecución, idempotente, no borra datos)
    - `CREATE OR REPLACE FUNCTION recibo_cierre(p_turno UUID)` `STABLE SECURITY DEFINER` con la forma de la sección 1 del diseño; `TURNO_NO_ABIERTO` si no existe y `TURNO_NO_CERRADO` si está abierto
    - Cálculos copiados de `resumen_turno`, `efectivo_esperado_turno` (Parte_Cajon) y `reporte_rango` (productos con fila "Venta por valor"), filtrados por el turno; autoconsumos no anulados agrupados por producto
    - `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO anon, authenticated`
    - Validar en PGlite temporal en `%TEMP%`: cargar dos veces y probar los casos de la estrategia de pruebas
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 7.2, 7.4_
  - [x] 1.2 API del cliente
    - `src/lib/api/errores.ts`: `TURNO_NO_CERRADO` en `CodigoError` y `CODIGOS_SQL`
    - Crear `src/lib/api/recibo.ts` con `DatosRecibo` y `datosReciboCierre(turnoId)` (snake_case → camelCase, `Number(...)`, nulos de `baseSiguiente`/`enviadoMayor`)
    - _Requirements: 1.7, 1.8, 7.3_

- [x] 2. Dominio puro del recibo (`src/lib/recibo/`)
  - [x] 2.1 Configuración y formato de texto
    - Crear `config.ts` (`ENCABEZADO_RECIBO`, `COLUMNAS`, `COLUMNAS_DOBLE`, `MAX_BYTES_RECIBO`, `PAGINA_CODIGOS`)
    - Crear `texto.ts` (`Estilo`, `LineaRecibo`, `anchoDe`, `dineroRecibo`, `textoDiferencia`, `fila`, `recortar`, `separador`)
    - _Requirements: 2.7, 2.11, 2.12_
  - [ ]* 2.2 Prueba de propiedad: formato de dinero y diferencia
    - Crear `src/lib/recibo/texto.test.ts`
    - **Property 1: Formato de dinero y diferencia**
    - **Validates: Requirements 2.7, 2.11**
  - [x] 2.3 Codificación y comandos ESC/POS
    - Crear `escpos.ts` (`codificarPC850`, `decodificarPC850`, `CMD`, `armarBytes`) con la tabla PC850 de los caracteres del español
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ]* 2.4 Prueba de propiedad: codificación PC850
    - Crear `src/lib/recibo/escpos.test.ts`
    - **Property 5: Codificación PC850**
    - **Validates: Requirements 3.2**
  - [ ]* 2.5 Prueba de propiedad: estructura de los bytes
    - **Property 6: Estructura de los bytes**
    - **Validates: Requirements 3.1, 3.3, 3.4**
  - [x] 2.6 Armado del Recibo_Cierre
    - Crear `reciboCierre.ts` (`lineasReciboCierre`, `bytesReciboCierre` con recorte a la mitad hasta caber en `MAX_BYTES_RECIBO`) según el esquema del diseño
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9, 2.10, 3.5, 3.6_
  - [ ]* 2.7 Pruebas de propiedad del recibo
    - Crear `src/lib/recibo/reciboCierre.test.ts`
    - **Property 2: Ancho de línea** — **Validates: Requirements 2.12**
    - **Property 3: Contenido y cifras del recibo** — **Validates: Requirements 2.1, 2.4, 2.5, 2.6, 2.8, 2.9, 2.10**
    - **Property 4: Fechas y horas del turno** — **Validates: Requirements 2.2, 2.3**
    - **Property 7: Tamaño máximo y recorte** — **Validates: Requirements 3.5, 3.6**

- [x] 3. Envío al agente
  - [x] 3.1 Cliente y orquestación
    - `src/lib/cajon.ts`: `ResultadoImpresion`, `aBase64`, `imprimirEnAgente` (POST `/imprimir`, body string base64, timeout 5000 ms); `abrirCajonSinPapel` sin cambios
    - Crear `src/lib/recibo/imprimir.ts` (`imprimirReciboCierre`, `mensajeImpresion` con los textos del Req 5.5-5.8)
    - _Requirements: 4.1, 5.5, 5.6, 5.7, 5.8_
  - [ ]* 3.2 Prueba de propiedad: base64 del cuerpo
    - Crear `src/lib/cajon.test.ts`
    - **Property 8: Base64 del cuerpo**
    - **Validates: Requirements 4.1**
  - [ ]* 3.3 Pruebas de ejemplo de `imprimirReciboCierre`
    - Crear `src/lib/recibo/imprimir.test.ts` con `datosReciboCierre` y `fetch` simulados: éxito, `sin_datos`, `sin_agente`, `error` y sus mensajes
    - _Requirements: 5.5, 5.6, 5.7, 5.8_
  - [x] 3.4 Ruta `POST /imprimir` del agente
    - `herramientas/cajon/agente-cajon.ps1`: `Enviar` con nombre de documento, parseo de encabezados solo hasta `\r\n\r\n`, `LeerCuerpo` por `Content-Length`, respuestas 411/413/400/500/200 y anotaciones sin contenido; comentarios de seguridad actualizados; `/estado`, `/abrir` y `OPTIONS` sin cambios
    - `herramientas/cajon/LEEME.md`: secciones "Imprimir el recibo de cierre" y "Actualizar el agente" (copiar carpeta y ejecutar `instalar.cmd`, conserva orígenes, compatible con el POS) y `POST /imprimir` en "Para desarrolladores"
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. UI
  - [x] 5.1 Impresión al cerrar y reimpresión
    - Crear `src/hooks/caja/useImprimirRecibo.ts` (estado, mensaje, `imprimir` con ref `enProceso`, automático una vez con ref `yaImpreso`)
    - `ResultadoCierre.tsx`: prop `turnoId`, línea de estado `role="status"` y botón "Imprimir recibo" `min-h-[56px]` deshabilitado mientras imprime; "Continuar" conserva el foco inicial
    - `PuntoVenta.tsx`: guardar el `turno.id` cerrado junto con `cierre` y pasarlo a `ResultadoCierre`; `ya_cerrado` sin cambios
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.9, 5.10, 7.1_
  - [ ]* 5.2 Pruebas de ejemplo de `ResultadoCierre`
    - Crear `src/components/caja/ResultadoCierre.test.tsx` (`// @vitest-environment jsdom`) con `imprimirReciboCierre` simulado: una sola impresión al montar, reimpresión con el botón, botón deshabilitado mientras imprime, mensaje de fallo
    - _Requirements: 5.1, 5.3, 5.4, 5.6_
  - [ ]* 5.3 Botón "Imprimir recibo" en Reportes > Turnos
    - `SeccionTurnos.tsx`: botón `min-h-[44px]` por turno cerrado que llama `imprimirReciboCierre` y muestra `mensajeImpresion` con `showToast`
    - _Requirements: 6.1, 6.2_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ejecutar `npx tsc --noEmit`, `npx next lint`, `npm run build` y `npm run test`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Ejecutar `supabase/migration-recibo-cierre.sql` a mano en Supabase; se puede repetir sin error
- Actualizar el agente en el equipo de la caja: copiar `herramientas/cajon` y ejecutar `instalar.cmd` (detiene el agente viejo, copia el nuevo y conserva los orígenes)
- Las pruebas de propiedad usan fast-check con al menos 100 corridas y la etiqueta `Feature: recibo-cierre-turno, Property N`
- El agente PowerShell se prueba a mano con `Invoke-WebRequest` (ver estrategia de pruebas del diseño)
- `/login`, `cerrar_turno`, `resumen_turno` y el cierre a ciegas no se tocan

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.3", "3.4"] },
    { "id": 1, "tasks": ["2.2", "2.4", "2.6"] },
    { "id": 2, "tasks": ["2.5", "2.7", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3"] }
  ]
}
```
