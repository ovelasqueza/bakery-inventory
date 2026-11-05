# Implementation Plan: Modo autoconsumo distinto de la venta

## Overview

Orden: tarjeta y cuadrícula → panel derecho → franja y conexión en `PuntoVenta` → checkpoint. No hay migración SQL ni cambios en la base de datos. Todo depende de la prop opcional `modo` (por defecto `'venta'`), así la venta por producto no cambia. Estas tareas se ejecutan después de la spec `recibo-cierre-turno`, que también toca `PuntoVenta.tsx`. `/login` no se toca.

## Tasks

- [x] 1. Tarjeta y cuadrícula en modo autoconsumo
  - [x] 1.1 Prop `modo` en `TarjetaProducto` y `CuadriculaProductos`
    - `TarjetaProducto.tsx`: exportar `ModoLista = 'venta' | 'autoconsumo'`; prop `modo?: ModoLista` (por defecto `'venta'`)
    - Autoconsumo: borde `lz-amber`, hover/active/foco ámbar, sin precio, "+" `bg-lz-amber text-lz-charcoal`, insignia `bg-lz-charcoal`, `aria-label` "Agregar {nombre} al autoconsumo[. Seleccionados: N]"
    - `CuadriculaProductos.tsx`: prop `modo?: ModoLista` que pasa a cada tarjeta
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 5.2_
  - [ ]* 1.2 Prueba de propiedad: la tarjeta muestra precio solo en venta
    - Crear `src/components/caja/TarjetaProducto.test.tsx` (`// @vitest-environment jsdom`)
    - **Property 1: La tarjeta muestra precio solo en venta**
    - **Validates: Requirements 2.3, 2.5**

- [x] 2. Panel derecho en modo autoconsumo
  - [x] 2.1 Prop `modo` en `PanelCarrito`
    - `modo?: ModoLista`; con `'autoconsumo'`, `titulo` por defecto "Autoconsumo" y `textoAccion` por defecto "Registrar consumo"
    - Objeto `TONO[modo]` con las clases del diseño: encabezado y pie `bg-lz-amber-light border-lz-amber`, botón `bg-lz-amber text-lz-charcoal`
    - `LineaPedido` con prop `sinPrecio`: sin "c/u" ni subtotal
    - Pie: "Artículos" + número grande y "Valor de referencia: $X · no se cobra" en `text-xs`
    - Barra móvil contraída: `bg-lz-amber-light border-t-4 border-lz-amber`, "Autoconsumo" + artículos, "Ver autoconsumo", sin pesos ni total en el `aria-label`
    - `'venta'` sin cambios
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 5.2_
  - [ ]* 2.2 Prueba de propiedad: las líneas del Panel_Autoconsumo no tienen precios
    - Crear `src/components/caja/PanelCarrito.test.tsx` (`// @vitest-environment jsdom`) con un `LayoutCaja` de escritorio
    - **Property 2: Las líneas del Panel_Autoconsumo no tienen precios**
    - **Validates: Requirements 3.2, 3.3, 5.1**
  - [ ]* 2.3 Prueba de propiedad: la barra móvil de autoconsumo no muestra pesos
    - En `PanelCarrito.test.tsx`, con un `LayoutCaja` móvil y `expandido = false`
    - **Property 3: La barra móvil de autoconsumo no muestra pesos**
    - **Validates: Requirements 4.1**
  - [ ]* 2.4 Pruebas de ejemplo del botón "Registrar consumo"
    - En `PanelCarrito.test.tsx`: deshabilitado con el Carrito vacío; con líneas llama `onCobrar`; tocar la barra móvil llama `onExpandir(true)`
    - _Requirements: 3.4, 3.5, 3.6, 4.2, 4.3_

- [x] 3. Franja y conexión en `PuntoVenta`
  - [x] 3.1 Crear `FranjaAutoconsumo` y conectarla en `src/components/caja/PuntoVenta.tsx`
    - Crear `src/components/caja/FranjaAutoconsumo.tsx` con `onSalir` y `onVerTurno`: fondo `lz-amber`, "MODO AUTOCONSUMO · No es una venta" (`role="status"`, `text-lg font-extrabold text-lz-charcoal`), botones "Autoconsumos del turno" y "Salir de autoconsumo" ≥ 44 px
    - `PuntoVenta.tsx`: reemplazar la franja actual por `FranjaAutoconsumo` (`onSalir={volverAVender}`, `onVerTurno={abrirListaAutoconsumos}`); `modo` a `CuadriculaProductos`; `bg-lz-amber-light` en la `section` con `enAutoconsumo`; `PanelCarrito key="autoconsumo"` con `modo="autoconsumo"` y `textoVacio`, sin `titulo`, `textoAccion` ni `nota`
    - Solo el bloque de autoconsumo; no tocar lo que agregó `recibo-cierre-turno`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.4, 3.5, 5.2_
  - [ ]* 3.2 Pruebas de ejemplo de `FranjaAutoconsumo`
    - Crear `src/components/caja/FranjaAutoconsumo.test.tsx` (`// @vitest-environment jsdom`): muestra el texto y los dos botones; cada botón llama su callback
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. Final checkpoint - Ensure all tests pass
  - Ejecutar `npx tsc --noEmit`, `npx next lint`, `npm run build` y `npm run test`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- No hay migración SQL; la lógica del autoconsumo (`DialogoAutoconsumo`, `ListaAutoconsumosTurno`, `src/lib/caja/*`) no cambia
- Las pruebas de propiedad usan fast-check con al menos 100 corridas y la etiqueta `Feature: modo-autoconsumo, Property N`
- Solo clases `lz-*` de `tailwind.config.ts`; toques ≥ 44 px; textos en español
- `/login` no se toca

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1"] },
    { "id": 2, "tasks": ["2.3", "3.2"] },
    { "id": 3, "tasks": ["2.4"] }
  ]
}
```
