# Requirements Document

## Introduction

Ajustes a la pantalla de Caja de Panadería Lizpan sobre lo construido en la spec `barra-acciones-caja`. No hay cambios de base de datos ni migración SQL.

Pedido del usuario: "mejor coloquemos los botones arriba en la cabecera, entre cada botón una separación para tocar bien; cambiemos nombre Gastos = Gastos/Pedidos, Retiro a caja mayor = Retiros; el botón grande Abrir cajón coloquémoslo como un botón flotante parte inferior izquierda; y en calculadora que vaya sumando sumando y al darle en cobrar que cobre de una sin mostrar la ventana de cobrar". Decisión adicional: en la Calculadora el método de pago se escoge antes, arriba de la lista de valores, con Efectivo por defecto, y "Cobrar" registra de una con ese método.

Resumen del comportamiento aprobado:

- **Botones en el encabezado:** los 6 Botones_Accion pasan al Encabezado_Caja, a la derecha del logo y el reloj, del mismo tamaño y con separación entre ellos. Se elimina la fila aparte de la Barra_Acciones.
- **Nombres:** "Gastos" pasa a "Gastos/Pedidos" y "Retiro a caja mayor" pasa a "Retiros", también en los títulos de sus ventanas.
- **Abrir cajón flotante:** botón redondo fijo en la esquina inferior izquierda, con la animación actual, con o sin turno.
- **Cobro directo en la Calculadora:** se siguen sumando valores; un selector de método de pago arriba de la lista; "Cobrar" registra la Venta_Por_Valor sin abrir el cobro en línea.

### Decisiones registradas

1. **Reparto del encabezado:** con turno abierto, el logo y el reloj quedan a la izquierda y los 6 botones a la derecha. Por debajo de 480 px solo caben los botones; de 480 a 767 px se muestra el reloj (solo la hora) y los botones; desde 768 px, logo, reloj y botones. El texto de los botones aparece desde 1280 px; por debajo, solo íconos con nombre accesible y título.
2. **Títulos de las ventanas:** la ventana de gastos se titula "Gastos/Pedidos del turno" y la de retiro "Retiros", con el texto de ayuda "El dinero sale del cajón hacia la caja mayor" para no perder qué hace.
3. **Cobro directo en efectivo:** se registra con recibido igual al total y cambio 0. Como el servidor acepta como máximo 10.000.000 de recibido, un total en efectivo mayor no se envía y se muestra un aviso.
4. **Vista `cobrando-valor`:** se elimina; la Calculadora ya no usa `PanelCobro`. `PanelCobro` sigue igual para el Pedido_Productos.

## Glossary

- **Sistema_Caja**: la aplicación cliente Next 14 de la Caja (`/caja`) junto con las funciones RPC que usa.
- **Servidor**: las funciones SQL `SECURITY DEFINER` de Supabase; en esta spec no cambian.
- **Turno**: fila de `turnos`; abierto mientras `cerrado_en` es nulo.
- **Encabezado_Caja**: franja superior de la Caja (`EncabezadoCaja`), de 96 px de alto.
- **Grupo_Acciones**: los 6 Botones_Accion dentro del Encabezado_Caja.
- **Boton_Accion**: cada uno de los botones Ventas, Gastos/Pedidos, Retiros, Autoconsumo, Calculadora y Cerrar turno.
- **Vista_Activa**: la vista de la Caja abierta encima o en lugar de la cuadrícula de productos (ventas del turno, gastos, retiro, autoconsumo o calculadora).
- **Boton_Cajon_Flotante**: botón fijo en la esquina inferior izquierda que abre el cajón monedero a mano.
- **Barra_Inferior_Movil**: barra fija inferior del Pedido_Productos, la Seleccion_Autoconsumo o la Lista_Valores en Modo_Movil, de 64 px de alto (`MEDIDAS.barraMovil`).
- **Modo_Movil**: layout de la Caja con ancho de ventana menor a 768 px; **Modo_Escritorio**: ancho de 768 px o más.
- **Ventana_Modal**: cualquier ventana con fondo oscuro que tapa la Caja (ventas del turno, gastos, retiro, cierre, autoconsumo, confirmaciones y advertencias).
- **Calculadora**: vista de la Caja para registrar una Venta_Por_Valor (`CalculadoraVenta` + `PanelValores`).
- **Valor_Digitado**: entero entre 0 y 10.000.000 que se está escribiendo en la Calculadora.
- **Lista_Valores**: valores ya agregados en la Calculadora, en orden; máximo 200.
- **Total_Valores**: suma de la Lista_Valores; máximo 99.999.999.
- **Selector_Metodo**: fila de botones con los métodos de pago activos, arriba de la Lista_Valores.
- **Metodo_Escogido**: método de pago marcado en el Selector_Metodo.
- **Venta_Por_Valor**: Venta con `tipo = 'valor'` registrada con `registrarVentaValor`.
- **Pedido_Productos**: el carrito actual de la Caja.

## Requirements

### Requirement 1: Botones de acción en el encabezado

**User Story:** Como persona de caja, quiero los botones arriba en el encabezado y separados, para tocarlos bien y tener más espacio para los productos.

#### Acceptance Criteria

1. WHILE hay un Turno abierto, THE Encabezado_Caja SHALL mostrar el Grupo_Acciones a la derecha, en este orden: Ventas, Gastos/Pedidos, Retiros, Autoconsumo, Calculadora, Cerrar turno.
2. WHILE no hay un Turno abierto, THE Encabezado_Caja SHALL ocultar el Grupo_Acciones.
3. THE Sistema_Caja SHALL mostrar los 6 Botones_Accion con el mismo ancho, el mismo alto, una zona táctil de al menos 44 × 44 px y una separación de al menos 8 px entre botones vecinos, en una sola fila dentro del Encabezado_Caja y sin desplazamiento horizontal para cualquier ancho de ventana entre 320 y 3840 px.
4. THE Sistema_Caja SHALL dejar de mostrar la Barra_Acciones como fila aparte debajo del Encabezado_Caja.
5. THE Sistema_Caja SHALL calcular el alto disponible para la cuadrícula como el alto de la ventana menos el Encabezado_Caja, y menos la Barra_Inferior_Movil en Modo_Movil.
6. WHILE una Vista_Activa está abierta, THE Sistema_Caja SHALL mostrar resaltado (tono activo y `aria-pressed`) el Boton_Accion que la abrió.
7. WHEN se toca el Boton_Accion de la Vista_Activa, THE Sistema_Caja SHALL cerrar esa vista y volver a la cuadrícula de productos.
8. THE Sistema_Caja SHALL mostrar el botón Cerrar turno con el tono de peligro y los demás Botones_Accion con el tono normal.
9. WHERE el ancho de ventana es de 1280 px o más, THE Sistema_Caja SHALL mostrar en cada Boton_Accion el ícono y el texto completo.
10. WHERE el ancho de ventana es menor a 1280 px, THE Sistema_Caja SHALL mostrar en cada Boton_Accion solo el ícono, con el texto completo como nombre accesible y como título.

### Requirement 2: Reparto del encabezado

**User Story:** Como persona de caja, quiero seguir viendo el logo y la hora cuando hay espacio, para no perder la referencia de la hora mientras vendo.

#### Acceptance Criteria

1. WHILE no hay un Turno abierto, THE Encabezado_Caja SHALL mostrar el logo y el reloj en formato de 12 horas a la izquierda.
2. WHILE hay un Turno abierto y el ancho de ventana es de 768 px o más, THE Encabezado_Caja SHALL mostrar el logo y el reloj en formato de 12 horas a la izquierda del Grupo_Acciones.
3. WHILE hay un Turno abierto y el ancho de ventana está entre 480 y 767 px, THE Encabezado_Caja SHALL mostrar solo la hora del reloj en formato de 12 horas a la izquierda del Grupo_Acciones.
4. WHILE hay un Turno abierto y el ancho de ventana es menor a 480 px, THE Encabezado_Caja SHALL mostrar solo el Grupo_Acciones.
5. THE Encabezado_Caja SHALL dejar de mostrar el botón "Abrir cajón".

### Requirement 3: Nombres de Gastos/Pedidos y Retiros

**User Story:** Como persona de caja, quiero nombres cortos y claros en los botones, para reconocerlos rápido.

#### Acceptance Criteria

1. THE Sistema_Caja SHALL mostrar el Boton_Accion de gastos con el texto, el nombre accesible y el título "Gastos/Pedidos".
2. THE Sistema_Caja SHALL mostrar el Boton_Accion de retiro con el texto, el nombre accesible y el título "Retiros".
3. THE Sistema_Caja SHALL titular la ventana de gastos "Gastos/Pedidos del turno".
4. THE Sistema_Caja SHALL titular la ventana de retiro "Retiros" y mostrar debajo del título el texto "El dinero sale del cajón hacia la caja mayor".

### Requirement 4: Botón flotante para abrir el cajón

**User Story:** Como persona de caja, quiero el botón de abrir cajón siempre a mano en la esquina, para abrirlo sin buscarlo en el encabezado.

#### Acceptance Criteria

1. THE Sistema_Caja SHALL mostrar el Boton_Cajon_Flotante fijo en la esquina inferior izquierda de la Caja, con o sin Turno abierto, con un tamaño de al menos 56 × 56 px y a 16 px de los bordes izquierdo e inferior.
2. WHERE la Caja está en Modo_Movil, THE Sistema_Caja SHALL ubicar el Boton_Cajon_Flotante 16 px por encima de la Barra_Inferior_Movil.
3. WHEN se toca el Boton_Cajon_Flotante, THE Sistema_Caja SHALL pedir la apertura del cajón y mostrar la misma animación y los mismos estados (abriendo, abierto, no abrió) que el botón actual.
4. THE Sistema_Caja SHALL dar al Boton_Cajon_Flotante el nombre accesible y el título "Abrir cajón".
5. WHILE una Ventana_Modal o el panel de móvil expandido está abierto, THE Sistema_Caja SHALL mostrar esa ventana o panel por encima del Boton_Cajon_Flotante.
6. THE Sistema_Caja SHALL dejar al final de la cuadrícula de productos, de la Calculadora y del cobro en línea un espacio inferior igual al alto del Boton_Cajon_Flotante más sus márgenes, para que el último elemento y los botones de cobro se puedan mostrar sin quedar debajo del Boton_Cajon_Flotante.

### Requirement 5: Método de pago en la Calculadora

**User Story:** Como persona de caja, quiero escoger el método de pago antes de cobrar, para que "Cobrar" registre la venta de una.

#### Acceptance Criteria

1. WHILE la Calculadora está abierta, THE Sistema_Caja SHALL mostrar el Selector_Metodo arriba de la Lista_Valores con un botón por cada método de pago activo, cada uno con una zona táctil de al menos 44 × 44 px.
2. WHEN se abre la Calculadora sin Metodo_Escogido, THE Sistema_Caja SHALL escoger el primer método activo de efectivo o, si no hay, el primer método activo.
3. WHEN se toca un método del Selector_Metodo, THE Sistema_Caja SHALL marcarlo como Metodo_Escogido con el tono activo y `aria-pressed`.
4. WHILE el Turno sigue abierto, THE Sistema_Caja SHALL conservar el Metodo_Escogido al cambiar de vista y volver a la Calculadora, mientras ese método siga activo.
5. WHEN una Venta_Por_Valor queda registrada, THE Sistema_Caja SHALL volver a escoger el método por defecto del criterio 5.2.

### Requirement 6: Cobro directo de la Calculadora

**User Story:** Como persona de caja, quiero que "Cobrar" registre de una la venta por valor, para atender más rápido sin otra ventana.

#### Acceptance Criteria

1. WHEN se toca "Cobrar" en la Calculadora con la Lista_Valores no vacía o un Valor_Digitado mayor que 0, THE Sistema_Caja SHALL registrar la Venta_Por_Valor con el Turno, el Metodo_Escogido y la Lista_Valores, sin abrir el cobro en línea.
2. WHEN se toca "Cobrar" con un Valor_Digitado mayor que 0, THE Sistema_Caja SHALL agregar el Valor_Digitado a la Lista_Valores antes de registrar.
3. WHERE el Metodo_Escogido es de efectivo, THE Sistema_Caja SHALL enviar el efectivo recibido igual al Total_Valores, con cambio 0.
4. WHERE el Metodo_Escogido no es de efectivo, THE Sistema_Caja SHALL enviar el registro sin efectivo recibido, de modo que el recibido quede igual al Total_Valores.
5. IF el Metodo_Escogido es de efectivo y el Total_Valores supera 10.000.000, THEN THE Sistema_Caja SHALL mostrar el aviso "En efectivo se cobra hasta $ 10.000.000. Escoja otro método o divida la venta." y conservar la Lista_Valores sin registrar.
6. THE Sistema_Caja SHALL registrar con una clave de idempotencia que se conserva mientras la Lista_Valores y el Metodo_Escogido no cambien.
7. WHILE la Venta_Por_Valor se está registrando, THE Sistema_Caja SHALL mostrar el botón "Cobrar" deshabilitado con el texto "Guardando…" y dejar sin efecto los cambios a la Lista_Valores, al Valor_Digitado y al Metodo_Escogido.
8. WHEN la Venta_Por_Valor queda registrada, THE Sistema_Caja SHALL vaciar la Lista_Valores, dejar el Valor_Digitado en 0, seguir en la Calculadora y mostrar la confirmación de venta con el total.
9. WHEN la Venta_Por_Valor queda registrada con un método de efectivo, THE Sistema_Caja SHALL pedir la apertura del cajón con la regla `cobro_efectivo`.
10. IF el registro falla sin conexión, THEN THE Sistema_Caja SHALL mostrar el aviso de sin conexión con un botón de reintento que usa la misma clave de idempotencia y conservar la Lista_Valores.
11. IF el Servidor responde `TURNO_CERRADO`, THEN THE Sistema_Caja SHALL seguir el flujo actual de turno cerrado y conservar la Lista_Valores.
12. IF el Servidor responde `METODO_INVALIDO`, THEN THE Sistema_Caja SHALL mostrar el mensaje "Ese método de pago ya no está disponible. Escoja otro." y conservar la Lista_Valores.
13. IF el Servidor responde otro error, THEN THE Sistema_Caja SHALL mostrar el mensaje "La venta no se guardó. Intente de nuevo." y conservar la Lista_Valores.
14. THE Sistema_Caja SHALL dejar de usar la vista de cobro en línea `cobrando-valor` para la Calculadora.

### Requirement 7: Compatibilidad

**User Story:** Como desarrollador, quiero que los ajustes no rompan el resto de la Caja, para instalarlos sin riesgo.

#### Acceptance Criteria

1. THE Sistema_Caja SHALL mantener sin cambios el cobro en línea del Pedido_Productos con `PanelCobro`.
2. THE Sistema_Caja SHALL usar solo clases Tailwind `lz-*`, textos en español y horas en formato de 12 horas con `hora12`.
3. THE Sistema_Caja SHALL dejar sin cambios la página `/login` y el esquema de la base de datos.
