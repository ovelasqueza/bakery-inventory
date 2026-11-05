# Requirements Document

## Introduction

Ajuste visual de la vista Autoconsumo de la Caja de Panadería Lizpan para que no se confunda con la venta por producto. No hay cambios de base de datos ni migración SQL, y la lógica del autoconsumo (Seleccion_Autoconsumo, `DialogoAutoconsumo`, `ListaAutoconsumosTurno`) sigue igual.

Pedido del usuario: "necesito que el autoconsumo sea diferente a la venta por producto; le doy y es como si estuviera vendiendo por producto y eso puede confundir al cajero". Opción aprobada: **"Ámbar y sin precios"**.

Resumen del comportamiento aprobado:

- **Franja de modo:** franja ámbar grande arriba de la búsqueda con "MODO AUTOCONSUMO · No es una venta", el botón "Salir de autoconsumo" y el botón existente "Autoconsumos del turno".
- **Productos en ámbar y sin precio:** la zona de productos tiene fondo ámbar claro; las tarjetas llevan borde y botón "+" ámbar y no muestran el precio.
- **Panel "Autoconsumo" en ámbar:** sin precio por unidad ni subtotal en las líneas; el dato principal es la cantidad de artículos; el valor total queda como referencia pequeña con "no se cobra"; el botón "Registrar consumo" es ámbar.
- **Móvil:** la barra inferior también es ámbar y dice "Autoconsumo".
- **Venta normal sin cambios.**

### Decisiones registradas

1. **Valor de referencia:** en el pie del panel se muestra en texto de 12 px "Valor de referencia: $X · no se cobra". En la barra inferior móvil contraída no se muestra ningún valor en pesos.
2. **Salir de autoconsumo:** vuelve a Vendiendo y conserva la Seleccion_Autoconsumo, igual que hoy al tocar de nuevo el Boton_Accion Autoconsumo.
3. **Contraste:** sobre `lz-amber` el texto va en `lz-charcoal` (el blanco no alcanza contraste suficiente).

## Glossary

- **Sistema_Caja**: la aplicación cliente Next 14 de la Caja (`/caja`).
- **Vista_Autoconsumo**: la vista `'autoconsumo'` de `PuntoVenta`, abierta con el Boton_Accion Autoconsumo.
- **Vista_Vendiendo**: la vista `'vendiendo'` de `PuntoVenta` (venta por producto).
- **Seleccion_Autoconsumo**: lista de productos y cantidades marcados como consumidos, separada del Pedido_Productos.
- **Franja_Autoconsumo**: franja ámbar arriba de la Barra_Busqueda en la Vista_Autoconsumo.
- **Barra_Busqueda**: el buscador y el filtro de categorías (`BarraBusqueda`).
- **Zona_Productos**: área izquierda con la Franja_Autoconsumo, la Barra_Busqueda y la cuadrícula o su estado vacío, de carga o de error.
- **Tarjeta_Producto**: botón de un producto en la cuadrícula (`TarjetaProducto`).
- **Cantidad_Seleccionada**: insignia con la cantidad del producto en la lista activa.
- **Panel_Autoconsumo**: `PanelCarrito` con la Seleccion_Autoconsumo en la Vista_Autoconsumo.
- **Panel_Pedido**: `PanelCarrito` con el Pedido_Productos en la Vista_Vendiendo.
- **Valor_Referencia**: suma de precio por cantidad de la Seleccion_Autoconsumo; no se cobra.
- **Barra_Inferior_Movil**: barra fija inferior del panel derecho en Modo_Movil, contraída.
- **Modo_Movil**: layout de la Caja con ancho de ventana menor a 768 px.
- **Clase_Lz**: clase de Tailwind con los colores `lz-*` de `tailwind.config.ts` (`lz-amber`, `lz-amber-warm`, `lz-amber-light`, `lz-charcoal`, etc.).

## Requirements

### Requirement 1: Franja de modo autoconsumo

**User Story:** Como cajero, quiero ver un aviso grande de que estoy en autoconsumo, para no creer que estoy vendiendo.

#### Acceptance Criteria

1. WHILE la Vista_Autoconsumo está abierta, THE Sistema_Caja SHALL mostrar la Franja_Autoconsumo arriba de la Barra_Busqueda, con fondo `lz-amber` y el texto "MODO AUTOCONSUMO · No es una venta" en negrita de al menos 18 px y color `lz-charcoal`.
2. WHILE la Vista_Autoconsumo está abierta, THE Franja_Autoconsumo SHALL mostrar los botones "Autoconsumos del turno" y "Salir de autoconsumo", cada uno de al menos 44 × 44 px.
3. WHEN el cajero toca "Salir de autoconsumo", THE Sistema_Caja SHALL abrir la Vista_Vendiendo y conservar la Seleccion_Autoconsumo.
4. WHEN el cajero toca "Autoconsumos del turno", THE Sistema_Caja SHALL abrir la lista de autoconsumos del turno.
5. WHILE la Vista_Vendiendo está abierta, THE Sistema_Caja SHALL ocultar la Franja_Autoconsumo.

### Requirement 2: Productos en ámbar y sin precio

**User Story:** Como cajero, quiero que los productos del autoconsumo se vean distintos y sin precio, para no confundirlos con la venta.

#### Acceptance Criteria

1. WHILE la Vista_Autoconsumo está abierta, THE Sistema_Caja SHALL pintar el fondo de la Zona_Productos con `lz-amber-light`, también en los estados de carga, vacío y error.
2. WHILE la Vista_Autoconsumo está abierta, THE Tarjeta_Producto SHALL mostrar borde `lz-amber` y el botón "+" con fondo `lz-amber`.
3. WHILE la Vista_Autoconsumo está abierta, THE Tarjeta_Producto SHALL mostrar el nombre, la foto y la Cantidad_Seleccionada, sin el precio en el texto visible ni en el nombre accesible.
4. WHEN el cajero toca una Tarjeta_Producto en la Vista_Autoconsumo, THE Sistema_Caja SHALL sumar 1 a ese producto en la Seleccion_Autoconsumo.
5. WHILE la Vista_Vendiendo está abierta, THE Tarjeta_Producto SHALL mostrar el precio, los colores y el nombre accesible actuales.

### Requirement 3: Panel Autoconsumo

**User Story:** Como cajero, quiero que el panel derecho del autoconsumo no parezca un cobro, para registrar el consumo sin dudas.

#### Acceptance Criteria

1. WHILE la Vista_Autoconsumo está abierta, THE Panel_Autoconsumo SHALL mostrar el título "Autoconsumo" con el encabezado y el pie en `lz-amber-light` y borde `lz-amber`.
2. WHILE la Vista_Autoconsumo está abierta, THE Panel_Autoconsumo SHALL mostrar en cada línea el nombre y los controles de cantidad, sin precio por unidad ni subtotal.
3. WHILE la Vista_Autoconsumo está abierta, THE Panel_Autoconsumo SHALL mostrar en el pie la cantidad de artículos como dato principal y el texto "Valor de referencia: $X · no se cobra" en 12 px, donde $X es el Valor_Referencia.
4. WHILE la Vista_Autoconsumo está abierta, THE Panel_Autoconsumo SHALL mostrar el botón "Registrar consumo" con fondo `lz-amber`, texto `lz-charcoal` y al menos 44 px de alto.
5. WHEN el cajero toca "Registrar consumo" con la Seleccion_Autoconsumo no vacía, THE Sistema_Caja SHALL abrir el diálogo de autoconsumo.
6. IF la Seleccion_Autoconsumo está vacía, THEN THE Panel_Autoconsumo SHALL mostrar el botón "Registrar consumo" deshabilitado.

### Requirement 4: Barra inferior móvil en autoconsumo

**User Story:** Como cajero en el celular, quiero que la barra inferior también indique autoconsumo, para no confundirla con el pedido.

#### Acceptance Criteria

1. WHILE el Modo_Movil está activo y la Vista_Autoconsumo está abierta, THE Barra_Inferior_Movil SHALL mostrar fondo `lz-amber-light`, borde superior `lz-amber`, la etiqueta "Autoconsumo" y la cantidad de artículos, sin valor en pesos.
2. WHILE el Modo_Movil está activo y la Vista_Autoconsumo está abierta, THE Barra_Inferior_Movil SHALL mostrar el botón "Registrar consumo" en `lz-amber` de al menos 44 px de alto.
3. WHEN el cajero toca la Barra_Inferior_Movil fuera del botón "Registrar consumo", THE Sistema_Caja SHALL expandir el Panel_Autoconsumo.

### Requirement 5: Venta normal sin cambios

**User Story:** Como cajero, quiero que la venta por producto siga igual, para no tener que aprender nada nuevo.

#### Acceptance Criteria

1. WHILE la Vista_Vendiendo está abierta, THE Panel_Pedido SHALL mostrar el título "Pedido", el precio por unidad, el subtotal por línea, el total y el botón "Cobrar" en verde como hoy.
2. THE Sistema_Caja SHALL usar solo Clase_Lz para los colores de la Franja_Autoconsumo, la Tarjeta_Producto, el Panel_Autoconsumo y la Barra_Inferior_Movil.
