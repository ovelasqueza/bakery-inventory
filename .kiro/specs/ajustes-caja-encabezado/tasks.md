# Implementation Plan: Ajustes de la Caja (botones en el encabezado, cajón flotante y cobro directo)

## Overview

Orden: dominio puro → encabezado, nombres y cajón flotante → cobro directo → conexión en `PuntoVenta` → checkpoint. No hay migración SQL ni cambios en la base de datos; `registrarVentaValor` se usa tal cual. `/login` no se toca.

## Tasks

- [x] 1. Dominio puro
  - [x] 1.1 Medidas del encabezado y del botón flotante en `src/lib/caja/layout.ts`
    - Quitar `MEDIDAS.barraAcciones` y `BARRA`; agregar `ENCABEZADO` y `CAJON_FLOTANTE` según el diseño
    - `LayoutCaja`: campos `encabezado` (`'acciones' | 'reloj' | 'completo'`), `anchoBotonAccion` (con el ancho de la izquierda y tope de 200 px), `textoEnAcciones` (ancho ≥ 1280) y `cajonFlotante` (`left`, `bottom`, `tamano`, `reserva`)
    - `altoDisponible` = alto − encabezado (− barraMovil en móvil)
    - _Requirements: 1.3, 1.5, 1.9, 1.10, 2.2, 2.3, 2.4, 4.1, 4.2, 4.6_
  - [ ]* 1.2 Prueba de propiedad: el Grupo_Acciones cabe en el encabezado
    - Crear `src/lib/caja/layout.test.ts`
    - **Property 1: El Grupo_Acciones cabe en el encabezado**
    - **Validates: Requirements 1.3, 1.9, 1.10, 2.2, 2.3, 2.4**
  - [ ]* 1.3 Prueba de propiedad: medidas verticales y botón flotante
    - **Property 2: Medidas verticales y botón flotante**
    - **Validates: Requirements 1.5, 4.1, 4.2, 4.6**
  - [x] 1.4 Cobro directo en `src/lib/caja/cobro.ts`
    - `metodoPorDefecto`, `metodoVigente`, `datosCobroDirecto` (efectivo: recibido = total, `EFECTIVO_MAXIMO` si total > `RECIBIDO_MAX`; otro método: recibido `null`; `VACIO`) y `firmaCobroDirecto`
    - _Requirements: 5.2, 5.4, 6.3, 6.4, 6.5, 6.6_
  - [ ]* 1.5 Prueba de propiedad: método por defecto y vigente
    - Crear `src/lib/caja/cobro.test.ts`
    - **Property 3: Método por defecto y vigente**
    - **Validates: Requirements 5.2, 5.4**
  - [ ]* 1.6 Prueba de propiedad: datos del cobro directo
    - **Property 4: Datos del cobro directo**
    - **Validates: Requirements 6.3, 6.4, 6.5**
  - [ ]* 1.7 Prueba de propiedad: firma del cobro directo
    - **Property 5: Firma del cobro directo**
    - **Validates: Requirements 6.6**

- [x] 2. Encabezado, nombres y cajón flotante
  - [x] 2.1 Grupo_Acciones dentro de `EncabezadoCaja`
    - `BarraAccionesCaja.tsx`: textos "Gastos/Pedidos" y "Retiros" (texto, `aria-label`, `title`); `nav` `grid-cols-6` con `columnGap` 8 px, ancho de botón `layout.anchoBotonAccion`, alto 48 px, sin alto ni borde de fila propia
    - `EncabezadoCaja.tsx`: props `layout?` y `acciones?`; izquierda según `layout.encabezado` (logo + reloj, solo hora con `Reloj soloHora`, o nada) y siempre logo + reloj sin `acciones`; grupo a la derecha; quitar `BotonAbrirCajon`
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.8, 1.9, 1.10, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 7.2_
  - [x] 2.2 Variante flotante de `BotonAbrirCajon`
    - Variante `'flotante'`: `fixed z-30` redondo de 56 × 56 px con prop `posicion` (`left`, `bottom`); misma animación, estados, `aria-label` y `title` "Abrir cajón"; quitar `'cabecera'` si queda sin uso
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 2.3 Títulos de las ventanas
    - `PanelGastos.tsx`: título "Gastos/Pedidos del turno"
    - `DialogoRetiro.tsx`: título "Retiros" con el texto "El dinero sale del cajón hacia la caja mayor" debajo
    - _Requirements: 3.3, 3.4_
  - [x] 2.4 Espacio bajo el botón flotante
    - Prop `reservaInferior?: number` como `paddingBottom` del contenedor con scroll en `CuadriculaProductos.tsx`, `CalculadoraVenta.tsx` y `PanelCobro.tsx`
    - `CalculadoraVenta.tsx`: prop `registrando` que deja las teclas sin efecto mientras se registra
    - _Requirements: 4.6, 6.7_
  - [ ]* 2.5 Pruebas de ejemplo del Grupo_Acciones
    - Crear `src/components/caja/BarraAccionesCaja.test.tsx` (`// @vitest-environment jsdom`): 6 botones en orden con "Gastos/Pedidos" y "Retiros", `aria-pressed` solo en el activo, sin texto visible con `textoEnAcciones = false`
    - _Requirements: 1.1, 1.6, 1.10, 3.1, 3.2_

- [x] 3. Cobro directo de la Calculadora
  - [x] 3.1 Hooks de clave y cobro
    - `src/hooks/caja/useClaveIdempotente.ts`: exportar `nuevoUuid` y agregar `useClavePorFirma` (`claveDe`, `renovar`)
    - Crear `src/hooks/caja/useCobroDirecto.ts`: `registrando`, `error`, `limpiarError`, `cobrar(valores, metodo)` con `datosCobroDirecto`, `firmaCobroDirecto`, `registrarVentaValor`, cajón en efectivo, `renovar` al registrar y los errores `SIN_CONEXION`, `TURNO_CERRADO`, `METODO_INVALIDO`, `RECIBIDO_INVALIDO` y otros según el diseño
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.9, 6.10, 6.11, 6.12, 6.13_
  - [x] 3.2 Selector de método en `PanelValores`
    - Props `metodos`, `metodoId`, `onMetodo`, `registrando`, `error`, `onReintentar`; quitar `soloLectura`
    - Selector_Metodo arriba de la lista (botones ≥ 44 px, `aria-pressed`); "Guardando…" y controles deshabilitados mientras registra; `AvisoSinConexion` o mensaje de error encima de "Cobrar"; en móvil contraído, nombre del método junto al total
    - _Requirements: 5.1, 5.3, 6.7, 6.10, 6.12, 6.13, 7.2_
  - [ ]* 3.3 Pruebas de ejemplo de `useCobroDirecto`
    - Crear `src/hooks/caja/useCobroDirecto.test.tsx` (`// @vitest-environment jsdom`) con `registrarVentaValor` y `abrirCajon` simulados: efectivo envía `recibido = total` y abre el cajón; otro método envía `recibido: null`; `SIN_CONEXION` y el reintento usan la misma clave; `TURNO_CERRADO` llama `onTurnoCerrado`; `METODO_INVALIDO` deja el mensaje
    - _Requirements: 6.3, 6.4, 6.9, 6.10, 6.11, 6.12_

- [x] 4. Conexión en `PuntoVenta`
  - [x] 4.1 Conectar encabezado, botón flotante y cobro directo en `src/components/caja/PuntoVenta.tsx`
    - Quitar la vista `cobrando-valor`, `pedidoValor`, `volverACalculadora`, `alRegistradaValor` y su efecto; `accionActiva` sin `cobrando-valor`
    - `EncabezadoCaja` con `layout` en todos los estados y `acciones` solo con turno; quitar la fila `BarraAccionesCaja`
    - `BotonAbrirCajon variante="flotante"` con `layout.cajonFlotante` en error de carga, sin turno, con turno y resumen de cierre; `reservaInferior` a la cuadrícula, la Calculadora y `PanelCobro`
    - Estado `metodoValorId` con `metodoVigente`; `cobrarValor` con `valoresParaCobrar` y `useCobroDirecto.cobrar`; al registrar, vaciar la Calculadora, volver al método por defecto y mostrar `ConfirmacionVenta` con cambio 0; `despacharCalculadora` sin efecto mientras registra; `limpiarError` al cambiar la lista o el método
    - _Requirements: 1.2, 1.4, 1.5, 1.7, 4.1, 4.2, 4.5, 5.2, 5.4, 5.5, 6.1, 6.2, 6.7, 6.8, 6.11, 6.14, 7.1_

- [x] 5. Final checkpoint - Ensure all tests pass
  - Ejecutar `npx tsc --noEmit`, `npx next lint`, `npm run build` y `npm run test`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- No hay migración SQL; la Venta_Por_Valor usa `registrar_venta_valor` como hoy
- Las pruebas de propiedad usan fast-check con al menos 100 corridas y la etiqueta `Feature: ajustes-caja-encabezado, Property N`
- `PanelCobro` sigue igual para el Pedido_Productos; solo recibe `reservaInferior`
- `/login` no se toca

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "2.2", "2.3", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.5", "2.1", "2.4", "3.2"] },
    { "id": 2, "tasks": ["1.3", "1.6", "2.5", "3.3"] },
    { "id": 3, "tasks": ["1.7", "4.1"] }
  ]
}
```
