# Requirements Document

## Introduction

Esta funcionalidad reorganiza los botones de la Caja de Panadería Lizpan en una barra propia y agrega dos acciones nuevas: **Autoconsumo** y **Calculadora**. Se construye sobre las specs `caja-ventas-reportes` y `caja-mayor` (ya implementadas) y sobre `supabase/migration-ventas.sql` y `supabase/migration-caja-mayor.sql`.

Pedido del usuario: los botones de la Caja deben verse homogéneos, en una sección separada del resto. Se agrega un botón de autoconsumo y otro de calculadora para meter ventas en dinero sin escoger productos (por ejemplo, el cliente pide $ 2.000 de pan, se mete 2.000; luego pide $ 3.000, se mete 3.000; la Caja va sumando, muestra el total y cobra). La calculadora tiene un teclado numérico grande y, encima, el valor que se está digitando.

Resumen del comportamiento aprobado:

- **Barra de acciones:** una fila propia debajo del encabezado con 6 botones del mismo tamaño: Ventas, Gastos, Retiro a caja mayor, Autoconsumo, Calculadora y Cerrar turno (este último con tono de peligro). Solo se muestra con turno abierto. El encabezado queda con logo y reloj a la izquierda y "Abrir cajón" al centro.
- **Autoconsumo:** registra productos consumidos por alguien de la panadería. No cobra dinero, no descuenta stock, no mueve el cajón ni la Caja mayor y no cambia el efectivo esperado. Queda ligado al turno abierto, se puede ver y anular en el turno, y aparece en Reportes con su valor a precio de venta como referencia.
- **Calculadora:** venta por valor. Se digitan valores, se suman a una lista, se ve el total y se cobra con el mismo flujo de cobro que una venta de productos. Es independiente del pedido de productos. Cuenta como venta normal en totales, métodos de pago, efectivo esperado, cierre y Caja mayor. En Reportes aparece como "Venta por valor".

### Decisiones registradas

1. **Esquema de la venta por valor:** `ventas` recibe la columna `tipo` (`productos` o `valor`) y `venta_detalles.producto_id` pasa a aceptar nulo. Cada valor digitado es una línea con `producto_id` nulo, nombre "Venta por valor", cantidad 1 y precio igual al valor. Una venta tiene solo líneas de productos o solo líneas de valor.
2. **RPC nueva para la venta por valor:** `registrar_venta_valor`. `registrar_venta` y `anular_venta` no cambian; la anulación de una Venta_Por_Valor usa el flujo actual de anular ventas.
3. **Anular autoconsumo:** sigue el patrón de eliminar gasto: confirmación, sin motivo, solo con el turno abierto, y repetirlo no falla.
4. **Valor digitado pendiente:** al tocar "Cobrar" con un valor digitado mayor que 0 que no se agregó, la Calculadora lo agrega a la lista antes de cobrar.
5. **Barra en pantallas angostas:** en modo móvil (ancho menor a 768 px) los 6 botones muestran solo el ícono, con nombre accesible y título; en modo escritorio muestran ícono y texto. Los 6 caben en una fila sin desplazamiento horizontal desde 320 px de ancho.

## Glossary

- **Sistema_Caja**: la aplicación cliente Next 14 de la Caja (`/caja`) junto con las funciones RPC que usa.
- **Servidor**: las funciones SQL `SECURITY DEFINER` de Supabase que registran ventas, autoconsumos y movimientos.
- **Modulo_Reportes**: la sección de Reportes protegida por PIN (`/admin/reportes`).
- **Turno**: fila de `turnos`; abierto mientras `cerrado_en` es nulo.
- **Persona_Caja**: nombre (1 a 60 caracteres) de quien hace o recibe una acción, escogido de `personas_caja` o escrito a mano con el selector de persona actual.
- **Encabezado_Caja**: franja superior de la Caja (`EncabezadoCaja`) con logo, reloj de 12 horas y botón "Abrir cajón".
- **Barra_Acciones**: fila debajo del Encabezado_Caja con los 6 Botones_Accion.
- **Boton_Accion**: cada uno de los botones Ventas, Gastos, Retiro a caja mayor, Autoconsumo, Calculadora y Cerrar turno.
- **Vista_Activa**: la vista de la Caja que está abierta encima o en lugar de la cuadrícula de productos (ventas del turno, gastos, retiro, autoconsumo o calculadora).
- **Modo_Movil**: layout de la Caja con ancho de ventana menor a 768 px; **Modo_Escritorio**: ancho de 768 px o más (`src/lib/caja/layout.ts`).
- **Catalogo_Caja**: los productos vendibles que muestra la cuadrícula de la Caja (activos, no materia prima, visibles en Caja y con precio de venta).
- **Pedido_Productos**: el carrito actual de la Caja, con productos y cantidades.
- **Calculadora**: vista de la Caja para registrar una Venta_Por_Valor.
- **Valor_Digitado**: entero entre 0 y 10.000.000 que se está escribiendo en la Calculadora.
- **Lista_Valores**: valores ya agregados en la Calculadora, en el orden en que se agregaron; máximo 200 valores.
- **Total_Valores**: suma de la Lista_Valores; máximo 99.999.999.
- **Venta_Productos**: Venta con `tipo = 'productos'`; sus líneas tienen producto.
- **Venta_Por_Valor**: Venta con `tipo = 'valor'`; sus líneas son Lineas_Valor.
- **Linea_Valor**: fila de `venta_detalles` sin producto, con nombre "Venta por valor", cantidad 1 y precio igual al valor digitado.
- **Autoconsumo**: registro de productos consumidos por una Persona_Caja durante un Turno, sin cobro.
- **Seleccion_Autoconsumo**: lista temporal de productos y cantidades que se arma en la vista de Autoconsumo antes de registrarla.
- **Valor_Referencia**: suma de cantidad × precio de venta de los productos de un Autoconsumo al momento de registrarlo; solo informativo.
- **Autoconsumo_Anulado**: Autoconsumo con `anulado_en` lleno; se excluye de Reportes.

## Requirements

### Requirement 1: Barra de acciones homogénea

**User Story:** Como persona de caja, quiero los botones de la Caja en una fila propia y del mismo tamaño, para encontrarlos rápido y tener espacio para los botones nuevos.

#### Acceptance Criteria

1. WHILE hay un Turno abierto, THE Sistema_Caja SHALL mostrar la Barra_Acciones debajo del Encabezado_Caja con los Botones_Accion en este orden: Ventas, Gastos, Retiro a caja mayor, Autoconsumo, Calculadora, Cerrar turno.
2. WHILE no hay un Turno abierto, THE Sistema_Caja SHALL ocultar la Barra_Acciones.
3. THE Sistema_Caja SHALL mostrar los 6 Botones_Accion con el mismo ancho, el mismo alto y una zona táctil de al menos 44 × 44 px, en una sola fila y sin desplazamiento horizontal para cualquier ancho de ventana entre 320 y 3840 px.
4. THE Sistema_Caja SHALL mostrar el botón Cerrar turno con el tono de peligro y los demás Botones_Accion con el tono normal.
5. WHILE una Vista_Activa está abierta, THE Sistema_Caja SHALL mostrar resaltado (tono activo y `aria-pressed`) el Boton_Accion que la abrió.
6. WHEN se toca el Boton_Accion de la Vista_Activa, THE Sistema_Caja SHALL cerrar esa vista y volver a la cuadrícula de productos.
7. WHERE la Caja está en Modo_Escritorio, THE Sistema_Caja SHALL mostrar en cada Boton_Accion el ícono y el texto completo del botón, en hasta 2 líneas.
8. WHERE la Caja está en Modo_Movil, THE Sistema_Caja SHALL mostrar en cada Boton_Accion solo el ícono, con el texto completo como nombre accesible y como título.
9. THE Sistema_Caja SHALL mantener la pantalla de Caja sin desplazamiento global, restando el alto de la Barra_Acciones al alto disponible para la cuadrícula.

### Requirement 2: Encabezado sin botones de acción

**User Story:** Como persona de caja, quiero un encabezado limpio, para ver la hora y abrir el cajón sin confundirme con las demás acciones.

#### Acceptance Criteria

1. THE Encabezado_Caja SHALL mostrar el logo y el reloj en formato de 12 horas a la izquierda y el botón "Abrir cajón" al centro, con o sin Turno abierto.
2. THE Encabezado_Caja SHALL dejar de mostrar los botones Ventas, Gastos, Retiro a caja mayor y Cerrar turno.

### Requirement 3: Digitar valores en la Calculadora

**User Story:** Como persona de caja, quiero un teclado numérico grande con el valor encima, para meter rápido lo que pide el cliente en dinero.

#### Acceptance Criteria

1. WHEN se toca el Boton_Accion Calculadora, THE Sistema_Caja SHALL mostrar la Calculadora en el lugar de la cuadrícula de productos, sin ventana encima.
2. THE Sistema_Caja SHALL mostrar en la Calculadora un teclado numérico con las teclas 0 a 9, 000, retroceso y borrar, cada tecla con una zona táctil de al menos 44 × 44 px.
3. THE Sistema_Caja SHALL mostrar el Valor_Digitado encima del teclado, con formato de pesos.
4. WHEN se toca una tecla de dígito o 000, THE Sistema_Caja SHALL agregar esos dígitos al final del Valor_Digitado.
5. IF agregar dígitos dejaría el Valor_Digitado por encima de 10.000.000, THEN THE Sistema_Caja SHALL conservar el Valor_Digitado anterior.
6. WHEN se toca retroceso, THE Sistema_Caja SHALL quitar el último dígito del Valor_Digitado.
7. WHEN se toca borrar, THE Sistema_Caja SHALL dejar el Valor_Digitado en 0.
8. WHILE la Calculadora está abierta y el foco no está en un campo de texto, THE Sistema_Caja SHALL aceptar del teclado físico los dígitos, Retroceso (retroceso), Supr (borrar) y Enter (agregar).

### Requirement 4: Lista de valores y total

**User Story:** Como persona de caja, quiero que los valores se vayan sumando y ver el total, para cobrar todo junto al final.

#### Acceptance Criteria

1. WHEN se toca "Agregar" con un Valor_Digitado mayor que 0, THE Sistema_Caja SHALL agregar el Valor_Digitado al final de la Lista_Valores y dejar el Valor_Digitado en 0.
2. IF se toca "Agregar" con un Valor_Digitado igual a 0, THEN THE Sistema_Caja SHALL dejar la Lista_Valores sin cambios.
3. IF agregar el Valor_Digitado dejaría la Lista_Valores con más de 200 valores o el Total_Valores por encima de 99.999.999, THEN THE Sistema_Caja SHALL dejar la Lista_Valores sin cambios y mostrar un aviso con el límite.
4. THE Sistema_Caja SHALL mostrar la Lista_Valores en el orden en que se agregaron, con un botón para quitar cada valor, y el Total_Valores.
5. WHEN se quita un valor de la Lista_Valores, THE Sistema_Caja SHALL recalcular el Total_Valores sin ese valor.
6. WHEN se toca "Borrar todo" y se confirma, THE Sistema_Caja SHALL vaciar la Lista_Valores y dejar el Valor_Digitado en 0.
7. THE Sistema_Caja SHALL conservar la Lista_Valores y el Pedido_Productos por separado, sin pasar valores al Pedido_Productos ni productos a la Lista_Valores.
8. WHILE el Turno sigue abierto, THE Sistema_Caja SHALL conservar la Lista_Valores al cambiar a otra Vista_Activa o a la cuadrícula de productos.

### Requirement 5: Cobro de la venta por valor

**User Story:** Como persona de caja, quiero cobrar los valores con los mismos billetes, monedas y métodos de pago de siempre, para no aprender otro cobro.

#### Acceptance Criteria

1. WHEN se toca "Cobrar" en la Calculadora con la Lista_Valores no vacía, THE Sistema_Caja SHALL mostrar el cobro en línea con el Total_Valores como total, con los mismos métodos de pago, billetes, monedas, teclado, "Paga exacto" y cálculo de cambio que el cobro del Pedido_Productos.
2. WHEN se toca "Cobrar" con un Valor_Digitado mayor que 0, THE Sistema_Caja SHALL agregar el Valor_Digitado a la Lista_Valores antes de abrir el cobro.
3. WHILE la Lista_Valores está vacía y el Valor_Digitado es 0, THE Sistema_Caja SHALL mostrar el botón "Cobrar" de la Calculadora deshabilitado.
4. WHEN se confirma el cobro de la Calculadora, THE Sistema_Caja SHALL registrar una Venta_Por_Valor con el Turno, el método de pago, la Lista_Valores y el efectivo recibido, usando una clave de idempotencia que se conserva mientras la Lista_Valores, el método y el recibido no cambien.
5. WHEN la Venta_Por_Valor queda registrada, THE Sistema_Caja SHALL vaciar la Lista_Valores, volver a la Calculadora y mostrar la confirmación de venta con total y cambio, igual que en una Venta_Productos.
6. WHEN la Venta_Por_Valor queda registrada con un método de efectivo, THE Sistema_Caja SHALL pedir la apertura del cajón con la misma regla que una Venta_Productos en efectivo.
7. WHEN se toca "Volver" en el cobro de la Calculadora, THE Sistema_Caja SHALL volver a la Calculadora con la Lista_Valores sin cambios.
8. IF el Servidor responde `TURNO_CERRADO` al registrar una Venta_Por_Valor, THEN THE Sistema_Caja SHALL seguir el flujo actual de turno cerrado y conservar la Lista_Valores.
9. IF el registro falla sin conexión, THEN THE Sistema_Caja SHALL mostrar el aviso de sin conexión con un botón de reintento que usa la misma clave de idempotencia.

### Requirement 6: Registro de la venta por valor en el servidor

**User Story:** Como dueño, quiero que la venta por valor cuente igual que cualquier venta, para que los totales, el cierre y la caja mayor cuadren.

#### Acceptance Criteria

1. WHEN se registra una Venta_Por_Valor válida, THE Servidor SHALL guardar una Venta con `tipo = 'valor'`, total igual a la suma de los valores y una Linea_Valor por cada valor, en el orden enviado y en una sola transacción.
2. IF la lista de valores está vacía, tiene más de 200 valores, tiene un valor que no es un entero entre 1 y 10.000.000 o suma más de 99.999.999, THEN THE Servidor SHALL rechazar la venta con `DATOS_INVALIDOS`.
3. IF el Turno está cerrado o no existe, THEN THE Servidor SHALL rechazar la Venta_Por_Valor con `TURNO_CERRADO`.
4. IF el método de pago no existe o está inactivo, THEN THE Servidor SHALL rechazar la Venta_Por_Valor con `METODO_INVALIDO`.
5. IF el método es efectivo y el recibido es nulo, menor que el total o mayor que 10.000.000, THEN THE Servidor SHALL rechazar la Venta_Por_Valor con `RECIBIDO_INVALIDO`.
6. WHEN se reintenta una Venta_Por_Valor con la misma clave de idempotencia, THE Servidor SHALL devolver la venta original sin crear otra.
7. THE Servidor SHALL incluir las Ventas_Por_Valor registradas en el efectivo esperado del Turno, en el resumen del Turno, en los totales por método de pago, en las entradas a la Caja mayor al cerrar y en todos los totales de ventas de Reportes, igual que las Ventas_Productos.
8. WHEN se anula una Venta_Por_Valor, THE Servidor SHALL aplicar las mismas reglas y efectos que al anular una Venta_Productos.
9. THE Sistema_Caja SHALL mostrar en la lista de ventas del Turno las Ventas_Por_Valor con la etiqueta "Venta por valor" y, en su detalle, cada valor en el orden en que se agregó.

### Requirement 7: Esquema de ventas por valor y compatibilidad

**User Story:** Como desarrollador, quiero un esquema que distinga las ventas por valor sin romper las ventas existentes, para instalar el cambio sin perder datos.

#### Acceptance Criteria

1. THE Servidor SHALL marcar todas las ventas existentes y las registradas con `registrar_venta` como `tipo = 'productos'`.
2. THE Servidor SHALL aceptar `venta_detalles.producto_id` nulo solo en Lineas_Valor (nombre "Venta por valor", cantidad 1, precio entre 1 y 10.000.000 y orden entre 1 y 200).
3. IF se inserta una línea con producto en una Venta_Por_Valor o una Linea_Valor en una Venta_Productos, THEN THE Servidor SHALL rechazar la inserción.
4. THE Servidor SHALL rechazar cualquier cambio de `ventas.tipo` después de registrar la venta.
5. THE Servidor SHALL devolver en `detalle_venta` el tipo de la venta y las Lineas_Valor con producto nulo, ordenadas por su orden.

### Requirement 8: Selección de productos para autoconsumo

**User Story:** Como persona de caja, quiero escoger del catálogo los productos que alguien de la panadería consumió, para dejarlos registrados sin cobrarlos.

#### Acceptance Criteria

1. WHEN se toca el Boton_Accion Autoconsumo, THE Sistema_Caja SHALL mostrar el Catalogo_Caja con búsqueda y filtro de categoría, un aviso "Autoconsumo: toque los productos consumidos" y la Seleccion_Autoconsumo en el lugar del Pedido_Productos.
2. WHILE la vista de Autoconsumo está abierta, WHEN se toca un producto del Catalogo_Caja, THE Sistema_Caja SHALL sumar una unidad de ese producto a la Seleccion_Autoconsumo.
3. THE Sistema_Caja SHALL permitir en la Seleccion_Autoconsumo sumar, restar, escribir y quitar cantidades enteras entre 1 y 999 por producto, con las mismas reglas que el Pedido_Productos.
4. THE Sistema_Caja SHALL mostrar en la Seleccion_Autoconsumo el Valor_Referencia con el texto "Valor a precio de venta (no se cobra)".
5. THE Sistema_Caja SHALL conservar el Pedido_Productos sin cambios mientras se arma la Seleccion_Autoconsumo.

### Requirement 9: Registro del autoconsumo

**User Story:** Como dueño, quiero saber quién consumió qué productos, para controlar lo que se consume sin afectar el dinero de la caja.

#### Acceptance Criteria

1. WHEN se toca "Registrar" con la Seleccion_Autoconsumo no vacía, THE Sistema_Caja SHALL pedir la Persona_Caja que consumió y una nota opcional, y mostrar el resumen de productos y el Valor_Referencia.
2. IF la Persona_Caja está vacía o supera 60 caracteres, o la nota supera 120 caracteres, THEN THE Sistema_Caja SHALL mostrar un mensaje junto al campo y no enviar el Autoconsumo.
3. WHEN se confirma un Autoconsumo válido, THE Servidor SHALL guardar el Autoconsumo ligado al Turno con la Persona_Caja, la nota, la fecha del servidor, cada producto con su nombre, cantidad y precio de venta vigente, y el Valor_Referencia, en una sola transacción.
4. THE Servidor SHALL registrar el Autoconsumo sin crear ventas, gastos ni movimientos de la Caja mayor y sin cambiar inventarios ni el efectivo esperado del Turno.
5. IF el Turno está cerrado o no existe, THEN THE Servidor SHALL rechazar el Autoconsumo con `TURNO_CERRADO` y THE Sistema_Caja SHALL seguir el flujo actual de turno cerrado.
6. IF un producto no está en el Catalogo_Caja, THEN THE Servidor SHALL rechazar el Autoconsumo con `PRODUCTO_NO_DISPONIBLE` y THE Sistema_Caja SHALL recargar el catálogo, quitar de la Seleccion_Autoconsumo los productos que ya no están y mostrar un aviso.
7. IF las líneas están vacías, tienen más de 200 productos, repiten un producto o tienen una cantidad que no es un entero entre 1 y 999, THEN THE Servidor SHALL rechazar el Autoconsumo con `DATOS_INVALIDOS`.
8. WHEN se reintenta un Autoconsumo con la misma clave de idempotencia, THE Servidor SHALL devolver el Autoconsumo original sin crear otro.
9. WHEN el Autoconsumo queda registrado, THE Sistema_Caja SHALL vaciar la Seleccion_Autoconsumo y mostrar el aviso "Autoconsumo registrado".

### Requirement 10: Autoconsumos del turno y anulación

**User Story:** Como persona de caja, quiero ver los autoconsumos del turno y anular uno mal registrado, para corregir errores antes de cerrar.

#### Acceptance Criteria

1. WHILE la vista de Autoconsumo está abierta, THE Sistema_Caja SHALL mostrar un botón "Autoconsumos del turno" que abre la lista de Autoconsumos del Turno, del más reciente al más antiguo, con hora en formato de 12 horas, Persona_Caja, productos con cantidades, nota y Valor_Referencia.
2. THE Sistema_Caja SHALL mostrar los Autoconsumos_Anulados en la lista con la etiqueta "Anulado" y la hora de anulación, sin sumarlos al total de la lista.
3. WHEN se toca "Anular" en un Autoconsumo no anulado y se confirma, THE Servidor SHALL marcar el Autoconsumo como anulado con la fecha del servidor.
4. WHEN se anula un Autoconsumo ya anulado, THE Servidor SHALL terminar sin cambios.
5. IF el Turno del Autoconsumo está cerrado, THEN THE Servidor SHALL rechazar la anulación con `TURNO_CERRADO`.
6. IF el Autoconsumo no existe, THEN THE Servidor SHALL rechazar la anulación con `AUTOCONSUMO_NO_EXISTE`.
7. THE Servidor SHALL rechazar cualquier otro cambio o borrado de un Autoconsumo o de sus productos.

### Requirement 11: Venta por valor en Reportes

**User Story:** Como dueño, quiero distinguir en Reportes las ventas por valor, para saber cuánto se vendió sin escoger productos.

#### Acceptance Criteria

1. THE Modulo_Reportes SHALL mostrar en la sección Productos una fila "Venta por valor" con el número de valores y el valor vendido de las Ventas_Por_Valor registradas del rango.
2. THE Modulo_Reportes SHALL mostrar en las tablas de ventas registradas y anuladas de la sección Ventas, y en su CSV, una columna "Tipo" con "Productos" o "Venta por valor".
3. WHEN se abre el detalle de una Venta_Por_Valor en la sección Ventas, THE Modulo_Reportes SHALL mostrar cada Linea_Valor como "Venta por valor" con su valor.
4. THE Modulo_Reportes SHALL mantener que la suma de la sección Productos, la suma por día y la suma por método de pago sean iguales al total vendido del Resumen.

### Requirement 12: Sección Autoconsumo en Reportes

**User Story:** Como dueño, quiero una sección de autoconsumo en Reportes, para ver cuánto se consumió por producto y por persona.

#### Acceptance Criteria

1. THE Modulo_Reportes SHALL mostrar una pestaña "Autoconsumo" protegida por el mismo PIN que las demás secciones, con el filtro de rango de fechas.
2. WHEN se aplica un rango, THE Modulo_Reportes SHALL listar los Autoconsumos no anulados del rango, del más reciente al más antiguo, con fecha y hora en formato de 12 horas, Persona_Caja, productos con cantidades, nota y Valor_Referencia.
3. THE Modulo_Reportes SHALL mostrar el total por producto (cantidad y Valor_Referencia) y el total por Persona_Caja (registros y Valor_Referencia) de los Autoconsumos no anulados del rango.
4. THE Modulo_Reportes SHALL mostrar el Valor_Referencia con la aclaración "a precio de venta, no es dinero recibido".
5. THE Modulo_Reportes SHALL producir las mismas columnas y filas de la sección Autoconsumo en pantalla, PDF y CSV, con fechas de 12 horas en pantalla y PDF y `AAAA-MM-DD HH:mm` en CSV.
6. IF el rango no tiene Autoconsumos no anulados, THEN THE Modulo_Reportes SHALL mostrar el estado vacío en la sección Autoconsumo y deshabilitar la descarga de PDF y CSV.
7. THE Modulo_Reportes SHALL excluir los Autoconsumos de los totales de ventas, gastos, métodos de pago y turnos.

### Requirement 13: Migración, seguridad y compatibilidad

**User Story:** Como desarrollador, quiero una migración idempotente con las mismas reglas de seguridad de siempre, para instalarla en la capa gratuita sin riesgos.

#### Acceptance Criteria

1. THE Servidor SHALL definir los cambios en `supabase/migration-barra-acciones.sql`, ejecutable después de `migration-ventas.sql` y `migration-caja-mayor.sql` y más de una vez sin error.
2. THE Servidor SHALL dejar las tablas nuevas con RLS de solo lectura para las llaves anon y authenticated, y las escrituras solo por RPC `SECURITY DEFINER`.
3. THE Servidor SHALL revocar `EXECUTE` a PUBLIC y concederlo solo a anon y authenticated en cada RPC pública nueva o reemplazada.
4. THE Sistema_Caja SHALL reconocer el código de error `AUTOCONSUMO_NO_EXISTE` en `src/lib/api/errores.ts`.
5. THE Sistema_Caja SHALL usar solo la llave anon de Supabase, clases Tailwind `lz-*`, textos en español y horas en formato de 12 horas con `hora12` o `fechaHora12`.
6. THE Sistema_Caja SHALL dejar sin cambios la página `/login`.
