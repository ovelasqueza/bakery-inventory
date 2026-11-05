# Requirements Document

## Introduction

Panadería LIZPAN usa hoy una aplicación Next.js 14 (App Router) + Supabase, desplegada en Vercel (https://inventario-lizpan.vercel.app), para hacer inventarios. Esta funcionalidad agrega un sistema de ventas con dos partes:

1. **Caja/Ventas**: una pantalla muy simple para abrir un turno, escoger productos, cobrar y registrar gastos diarios. No hay login por cajero: es una panadería familiar y vende quien esté presente.
2. **Reportes y parametrización en Administración**: la página `/admin` conserva todo lo actual (configuración de producción y gestión de inventarios) y agrega un botón "Reportes" con reportes por secciones y la configuración que necesita la Caja.

Restricciones generales:
- La página de login (`/login`) y la página de inicio (`/`, `src/app/page.tsx`) no cambian.
- Las ventas no descuentan stock en esta versión.
- Los productos de tipo `materia_prima` no se venden en la Caja.
- Las fotos de productos se convierten a WebP en el navegador y se guardan en Supabase Storage, dentro del plan gratuito.
- La interfaz de Caja sigue la paleta y las fuentes del diseño de Stitch (carpetas `diseno/stitch/pantallas`, `diseno/stitch/codigo`, `diseno/paleta`, `diseno/logo`) y se adapta al espacio real con `window.innerWidth` y `window.innerHeight`.
- La moneda es el peso colombiano (COP, sin decimales) y la zona horaria es America/Bogota.

## Glossary

- **Aplicacion**: la aplicación web Next.js existente de Panadería LIZPAN, protegida por la contraseña compartida actual (`AuthProvider` + RPC `verificar_password`).
- **Caja**: el módulo de punto de venta accesible en la ruta `/caja`.
- **Panel_Admin**: la página existente `/admin`, ampliada con el acceso a Reportes.
- **Modulo_Reportes**: la sección de reportes y parametrización accesible desde el Panel_Admin (ruta `/admin/reportes`).
- **Modulo_Parametrizacion**: la parte del Modulo_Reportes donde el administrador configura métodos de pago, categorías de gasto, personas, base de caja, productos visibles, categorías de producto y PIN.
- **Turno**: período de trabajo de la Caja entre una apertura y un cierre; agrupa ventas y gastos.
- **Turno_Abierto**: el Turno que tiene apertura registrada y no tiene cierre registrado.
- **Persona_Caja**: nombre de un miembro de la familia o empleado que abre o cierra un Turno; no tiene contraseña.
- **Base_Caja**: dinero en efectivo con el que se abre un Turno.
- **Venta**: registro de un cobro con cabecera (Turno, fecha y hora, total, Metodo_Pago, efectivo recibido, cambio, estado) y uno o más Detalle_Venta.
- **Detalle_Venta**: línea de una Venta con producto, cantidad, precio unitario copiado del producto al momento de la venta y subtotal.
- **Venta_Anulada**: Venta con estado `anulada`; se excluye de todos los totales.
- **Carrito**: lista temporal, en la pantalla de Caja, de productos y cantidades antes de cobrar.
- **Metodo_Pago**: forma de pago configurable (por ejemplo Efectivo, Transferencia, Nequi). Cada Metodo_Pago indica si es efectivo o no.
- **Gasto**: salida de dinero en efectivo de la Caja durante un Turno, con valor, concepto y Categoria_Gasto.
- **Categoria_Gasto**: clasificación configurable de los Gastos (por ejemplo Insumos, Servicios, Transporte).
- **Categoria_Producto**: registro de la tabla `categorias` existente en Supabase, asignado a un producto mediante la columna `categoria_id`; un producto puede no tener Categoria_Producto. Es la categoría que usa el filtro de categoría de la Caja.
- **Efectivo_Esperado**: Base_Caja + suma de Ventas no anuladas en Metodo_Pago de efectivo del Turno − suma de Gastos del Turno.
- **Diferencia_Cierre**: efectivo contado al cierre − Efectivo_Esperado.
- **Producto_Vendible**: producto con `activo = true`, `tipo_producto` distinto de `materia_prima` y marcado como visible en Caja.
- **Procesador_Fotos**: componente del navegador que convierte una imagen elegida a WebP reducido.
- **Bucket_Productos**: bucket público de Supabase Storage llamado `productos` donde se guardan las fotos.
- **Agente_Cajon**: agente local existente (`127.0.0.1:17777`, función `abrirCajonSinPapel()` en `src/lib/cajon.ts`) que abre el cajón monedero.
- **Gestor_Layout**: lógica de la Caja que lee `window.innerWidth` y `window.innerHeight` y calcula columnas de la cuadrícula y tamaños de paneles.
- **PIN_Admin**: código numérico opcional, guardado con hash en la tabla `configuracion`, que protege el Modulo_Reportes.
- **Dia_Local**: día calendario en la zona horaria America/Bogota.

## Requirements

### Requirement 1: Acceso a la Caja sin modificar login ni inicio

**User Story:** Como persona que atiende la panadería, quiero entrar a la Caja con una dirección directa, para vender sin cambiar las pantallas de login e inicio que ya funcionan.

#### Acceptance Criteria

1. CUANDO un usuario con sesión válida abre la ruta `/caja` escribiéndola en el navegador, desde un marcador, desde el acceso directo de PWA o recargando la página, LA Aplicacion DEBERÁ mostrar la Caja sin pasar por `/` ni por `/admin`.
2. LA Aplicacion DEBERÁ mantener sin modificaciones los archivos `src/app/login/page.tsx` y `src/app/page.tsx`. Los cambios que se hagan en archivos compartidos (`src/app/layout.tsx`, `src/app/globals.css`, `AuthProvider`) no DEBERÁN cambiar los textos, los colores, las fuentes, la distribución ni el comportamiento de navegación que `/login` y `/` muestran hoy.
3. CUANDO un usuario sin sesión válida abre `/caja`, LA Aplicacion DEBERÁ redirigir a `/login` con la protección existente de `AuthProvider`, sin mostrar productos, Turnos ni Ventas antes de la redirección.
4. LA Aplicacion DEBERÁ agregar a `public/manifest.json` un acceso directo (shortcut) de PWA con nombre "Caja" que abre `/caja`, y conservar sin cambios el resto de valores del manifiesto (nombre, iconos, `start_url`, colores).
5. EL Panel_Admin DEBERÁ mostrar en su encabezado un botón "Ir a Caja", visible sin desplazar la página, que navega a `/caja` en la misma pestaña.
6. LA Caja DEBERÁ mostrar en su encabezado, en cualquier pantalla de la Caja (apertura de turno, ventas o cierre), un botón "Administración" que navega a `/admin` en la misma pestaña.
7. CUANDO la Persona_Caja sale de la Caja con el botón "Administración" mientras existe un Turno_Abierto, LA Aplicacion DEBERÁ dejar el Turno_Abierto sin cerrar, con sus Ventas y Gastos registrados sin cambios, y mostrarlo de nuevo al volver a `/caja`.
8. SI la Persona_Caja toca el botón "Administración" mientras el Carrito tiene al menos una línea, ENTONCES LA Caja DEBERÁ pedir confirmación antes de salir. Si la Persona_Caja cancela, LA Caja DEBERÁ quedarse en la pantalla con el Carrito sin cambios.

### Requirement 2: Apertura de turno

**User Story:** Como persona que atiende, quiero abrir un turno indicando mi nombre y la base en efectivo, para empezar a registrar ventas y gastos.

#### Acceptance Criteria

1. MIENTRAS no existe un Turno_Abierto, LA Caja DEBERÁ mostrar la pantalla de apertura de turno en lugar de la pantalla de ventas y no permitir registrar Ventas ni Gastos.
2. LA Caja DEBERÁ permitir escoger la Persona_Caja de la lista de Persona_Caja activas configuradas en el Modulo_Parametrizacion o escribir un nombre libre que, sin espacios al inicio ni al final, tenga de 1 a 60 caracteres.
3. CUANDO se muestra la pantalla de apertura de turno, LA Caja DEBERÁ precargar el campo de Base_Caja con la base por defecto configurada en el Modulo_Parametrizacion, o con 0 si no hay base por defecto configurada, y permitir editarlo.
4. CUANDO la Persona_Caja confirma la apertura con un nombre válido y una Base_Caja entera entre 0 y 99.999.999 COP, LA Caja DEBERÁ registrar un Turno con Persona_Caja, Base_Caja y fecha y hora de apertura del servidor, y mostrar la pantalla de ventas con el nombre de la Persona_Caja y la hora de apertura en formato America/Bogota.
5. SI ya existe un Turno_Abierto al momento de confirmar la apertura, incluso uno abierto desde otro dispositivo, ENTONCES LA Caja DEBERÁ rechazar la nueva apertura, mostrar un aviso con la Persona_Caja y la hora de apertura del Turno_Abierto existente, mostrar la pantalla de ventas de ese Turno y conservar un único Turno_Abierto.
6. SI la Base_Caja está vacía, es negativa, no es un número entero o supera 99.999.999 COP, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error junto al campo Base_Caja, no registrar el Turno y conservar los valores escritos.
7. SI el nombre de la Persona_Caja está vacío o supera 60 caracteres después de quitar espacios al inicio y al final, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error junto al campo de nombre, no registrar el Turno y conservar los valores escritos.
8. DONDE la apertura del cajón al abrir o cerrar Turno está activada en el Modulo_Parametrizacion, CUANDO se registra la apertura de un Turno, LA Caja DEBERÁ solicitar la apertura del cajón al Agente_Cajon.
9. SI el Agente_Cajon no responde en 3 segundos o responde con error, ENTONCES LA Caja DEBERÁ mostrar un aviso indicando que el cajón no se abrió y mantener registrado el Turno.
10. SI el registro del Turno falla por un error distinto a la existencia de un Turno_Abierto, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error indicando que el Turno no se abrió, no registrar el Turno y conservar en pantalla el nombre y la Base_Caja escritos para reintentar.

### Requirement 3: Cierre de turno

**User Story:** Como persona que atiende, quiero cerrar el turno contando el efectivo, para saber si la caja cuadra.

#### Acceptance Criteria

1. MIENTRAS existe un Turno_Abierto, LA Caja DEBERÁ mostrar un botón "Cerrar turno" habilitado para cualquier Persona_Caja, sin importar qué Persona_Caja abrió el Turno.
2. CUANDO la Persona_Caja toca "Cerrar turno", LA Caja DEBERÁ mostrar, en COP sin decimales, la Base_Caja, el total de Ventas no anuladas por cada Metodo_Pago usado en el Turno, el total de Gastos y el Efectivo_Esperado del Turno, junto con un campo de efectivo contado vacío y un campo de Persona_Caja que acepta un nombre de la lista configurada de Persona_Caja activas o un nombre libre de 1 a 60 caracteres.
3. CUANDO la Persona_Caja confirma el cierre con un efectivo contado entero mayor o igual a 0 y un nombre válido, LA Caja DEBERÁ registrar en el Turno la fecha y hora de cierre, la Persona_Caja que cierra, el efectivo contado, el Efectivo_Esperado y la Diferencia_Cierre, calculando el Efectivo_Esperado con todas las Ventas y Gastos del Turno registrados hasta el momento de la confirmación, incluidos los registrados desde otros dispositivos.
4. LA Caja DEBERÁ calcular el Efectivo_Esperado como Base_Caja + suma de Ventas no anuladas con Metodo_Pago de efectivo − suma de Gastos del Turno, y la Diferencia_Cierre como efectivo contado − Efectivo_Esperado.
5. CUANDO se registra el cierre, LA Caja DEBERÁ mostrar un resumen con el efectivo contado, el Efectivo_Esperado y el valor absoluto de la Diferencia_Cierre en COP sin decimales, con la etiqueta "Cuadra" si la Diferencia_Cierre es 0, "Sobrante" si es mayor a 0 o "Faltante" si es menor a 0.
6. DONDE la apertura del cajón al abrir o cerrar Turno está activada en el Modulo_Parametrizacion, CUANDO se registra el cierre, LA Caja DEBERÁ solicitar la apertura del cajón al Agente_Cajon.
7. CUANDO la Persona_Caja cierra el resumen del cierre, LA Caja DEBERÁ mostrar la pantalla de apertura de turno.
8. SI el Turno ya tiene un cierre registrado (por ejemplo, desde otro dispositivo) al momento de confirmar el cierre, ENTONCES LA Caja DEBERÁ rechazar el nuevo cierre sin modificar el cierre ya registrado, mostrar un aviso con la Persona_Caja y la hora de ese primer cierre, y mostrar la pantalla de apertura de turno.
9. SI el efectivo contado está vacío, es negativo o no es un número entero, o el nombre de la Persona_Caja está vacío o supera 60 caracteres, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error junto al campo inválido, no registrar el cierre y mantener el Turno como Turno_Abierto con los valores escritos conservados en pantalla.
10. SI el Agente_Cajon no responde a la solicitud de apertura del cajón en el cierre, ENTONCES LA Caja DEBERÁ mostrar un aviso indicando que el cajón no se abrió y mantener registrado el cierre del Turno.
11. CUANDO la Persona_Caja cancela el cierre antes de confirmarlo, LA Caja DEBERÁ volver a la pantalla de ventas sin registrar datos de cierre y mantener el Turno como Turno_Abierto con su Carrito, Ventas y Gastos sin cambios.

### Requirement 4: Catálogo de productos en Caja

**User Story:** Como persona que atiende, quiero ver los productos con foto y buscarlos rápido, para vender sin perder tiempo.

#### Acceptance Criteria

1. MIENTRAS existe un Turno_Abierto, CUANDO se carga la pantalla de ventas, LA Caja DEBERÁ mostrar una cuadrícula con todos los Producto_Vendible leídos de Supabase en esa carga, y un indicador de carga hasta que la lista termine de llegar.
2. LA Caja DEBERÁ excluir de la cuadrícula los productos con `tipo_producto = 'materia_prima'`, los productos con `activo = false` y los productos marcados como no visibles en Caja en el Modulo_Parametrizacion.
3. LA Caja DEBERÁ mostrar en cada tarjeta de producto el nombre (cortado con puntos suspensivos si no cabe en 2 líneas), el precio unitario vigente en COP sin decimales con `formatCurrency` y la foto del producto.
4. SI un Producto_Vendible no tiene `imagen_path` o su foto no carga desde el Bucket_Productos, ENTONCES LA Caja DEBERÁ mostrar una imagen de reemplazo con la primera letra del nombre del producto en mayúscula.
5. CUANDO la Persona_Caja escribe en el buscador (máximo 50 caracteres), LA Caja DEBERÁ mostrar, en un máximo de 300 ms después de la última tecla, solo los Producto_Vendible cuyo nombre contiene el texto escrito sin espacios al inicio ni al final, sin distinguir mayúsculas, minúsculas ni tildes; si el texto queda vacío, LA Caja DEBERÁ mostrar todos los Producto_Vendible de la categoría seleccionada.
6. CUANDO la Persona_Caja selecciona una categoría en el filtro, LA Caja DEBERÁ mostrar solo los Producto_Vendible de esa categoría que además cumplen el texto del buscador; la opción "Todas", seleccionada por defecto, DEBERÁ mostrar los Producto_Vendible de todas las categorías y los que no tienen categoría.
7. LA Caja DEBERÁ ordenar los Producto_Vendible de forma ascendente según el número de orden configurado en el Modulo_Parametrizacion y, cuando dos productos tienen el mismo orden o no tienen orden, por nombre en orden alfabético sin distinguir mayúsculas ni tildes; los productos sin orden configurado DEBERÁN aparecer después de los que tienen orden.
8. SI la búsqueda y el filtro de categoría no dejan ningún Producto_Vendible, ENTONCES LA Caja DEBERÁ mostrar un estado vacío con un mensaje indicando que no hay productos que coincidan y un botón para limpiar la búsqueda y volver a "Todas".
9. SI no existe ningún Producto_Vendible, ENTONCES LA Caja DEBERÁ mostrar un estado vacío con un mensaje indicando que se deben marcar productos como visibles en Caja desde el Modulo_Parametrizacion.
10. SI la lista de productos no se puede leer de Supabase, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error con un botón "Reintentar", mantener el Carrito sin cambios y no mostrar productos de una carga incompleta.

### Requirement 5: Carrito

**User Story:** Como persona que atiende, quiero armar el pedido tocando productos, para ver el total antes de cobrar.

#### Acceptance Criteria

1. CUANDO la Persona_Caja toca un producto de la cuadrícula que no está en el Carrito, LA Caja DEBERÁ agregar al Carrito una línea de ese producto con cantidad 1 y con el precio unitario que muestra la tarjeta del producto.
2. CUANDO la Persona_Caja toca un producto que ya está en el Carrito con cantidad menor a 999, LA Caja DEBERÁ aumentar en 1 la cantidad de esa línea sin crear una línea nueva.
3. CUANDO la Persona_Caja toca el botón de aumentar de una línea con cantidad menor a 999, LA Caja DEBERÁ aumentar en 1 la cantidad de esa línea.
4. CUANDO la Persona_Caja toca el botón de disminuir de una línea con cantidad mayor a 1, LA Caja DEBERÁ disminuir en 1 la cantidad de esa línea.
5. CUANDO la Persona_Caja escribe en el campo de cantidad de una línea un número entero entre 1 y 999, LA Caja DEBERÁ asignar ese número como cantidad de la línea.
6. CUANDO la Persona_Caja toca el botón de disminuir de una línea con cantidad 1, escribe 0 en su campo de cantidad o toca el botón de eliminar de la línea, LA Caja DEBERÁ quitar la línea del Carrito.
7. LA Caja DEBERÁ mostrar en cada línea del Carrito el nombre del producto, la cantidad, el precio unitario y el subtotal; DEBERÁ calcular el subtotal como cantidad × precio unitario y el total del Carrito como la suma de los subtotales de todas las líneas, ambos en COP sin decimales; y DEBERÁ actualizar subtotal, total y cantidad de artículos en pantalla sin recargar la página dentro de los 300 ms siguientes a cada cambio del Carrito.
8. LA Caja DEBERÁ mantener una sola línea por producto en el Carrito.
9. CUANDO la Persona_Caja toca "Vaciar" con al menos una línea en el Carrito, LA Caja DEBERÁ mostrar un diálogo de confirmación; si la Persona_Caja confirma, LA Caja DEBERÁ dejar el Carrito sin líneas y con total 0, y si la Persona_Caja cancela, LA Caja DEBERÁ conservar todas las líneas y cantidades sin cambios.
10. SI la Persona_Caja escribe en el campo de cantidad un valor vacío, no entero, negativo o mayor a 999, ENTONCES LA Caja DEBERÁ restaurar la cantidad anterior de la línea al salir del campo, mostrar un mensaje indicando que la cantidad debe ser un entero entre 1 y 999 y dejar el total del Carrito sin cambios.
11. SI la Persona_Caja toca un producto de la cuadrícula o el botón de aumentar de una línea cuya cantidad ya es 999, ENTONCES LA Caja DEBERÁ mantener la cantidad en 999 y mostrar un aviso indicando que se alcanzó la cantidad máxima de la línea.

### Requirement 6: Cobro y registro de la venta

**User Story:** Como persona que atiende, quiero cobrar escogiendo el método de pago y ver el cambio, para entregar el dinero correcto y que la venta quede guardada.

#### Acceptance Criteria

1. MIENTRAS el Carrito no tiene líneas, LA Caja DEBERÁ mantener deshabilitado el botón "Cobrar".
2. CUANDO la Persona_Caja toca "Cobrar", LA Caja DEBERÁ abrir la ventana de cobro con el total del Carrito en COP sin decimales y un botón por cada Metodo_Pago activo, en el orden configurado en el Modulo_Parametrizacion. La ventana DEBERÁ incluir una opción "Cancelar" que la cierra sin registrar la Venta y sin cambiar el Carrito.
3. CUANDO la Persona_Caja escoge un Metodo_Pago de efectivo, LA Caja DEBERÁ mostrar un campo de efectivo recibido vacío y botones de valor rápido. Los botones DEBERÁN ser uno con el valor exacto del total y uno por cada billete de 2.000, 5.000, 10.000, 20.000, 50.000 y 100.000 COP cuyo valor sea mayor al total. Tocar un botón de valor rápido DEBERÁ poner su valor en el campo de efectivo recibido.
4. CUANDO la Persona_Caja escoge un Metodo_Pago que no es de efectivo, LA Caja DEBERÁ ocultar el campo de efectivo recibido, habilitar la confirmación del cobro y registrar la Venta con efectivo recibido igual al total y cambio igual a 0.
5. CUANDO el efectivo recibido es un entero válido mayor o igual al total, LA Caja DEBERÁ mostrar el cambio, calculado como efectivo recibido − total en COP sin decimales, y habilitar la confirmación del cobro.
6. SI el efectivo recibido es menor al total, ENTONCES LA Caja DEBERÁ mostrar el faltante, calculado como total − efectivo recibido, y mantener deshabilitada la confirmación del cobro.
7. SI el efectivo recibido está vacío, no es un número entero, es negativo o es mayor a 10.000.000 COP, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error junto al campo y mantener deshabilitada la confirmación del cobro.
8. CUANDO la Persona_Caja confirma el cobro, LA Caja DEBERÁ registrar en una sola operación la cabecera de la Venta y todos sus Detalle_Venta, asociados al Turno_Abierto. La cabecera DEBERÁ incluir el Metodo_Pago, el efectivo recibido, el cambio, la fecha y hora y el estado `registrada`.
9. MIENTRAS la Venta se está registrando, LA Caja DEBERÁ mantener deshabilitado el botón de confirmación del cobro y mostrar un indicador de progreso. Así, tocar varias veces el botón produce como máximo una Venta.
10. LA Caja DEBERÁ guardar en cada Detalle_Venta el precio unitario vigente del producto al momento de la venta, de forma que cambios de precio posteriores no alteren Ventas registradas.
11. PARA TODA Venta registrada, el total de la cabecera DEBERÁ ser igual a la suma de los subtotales (cantidad × precio unitario) de sus Detalle_Venta, y el cambio DEBERÁ ser igual a efectivo recibido − total.
12. SI el registro de la Venta falla o no termina en 15 segundos, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error que indique que la Venta no se guardó, conservar el Carrito y la ventana de cobro con los datos ingresados, y dejar sin registrar tanto la cabecera como los Detalle_Venta.
13. SI no existe un Turno_Abierto al confirmar el cobro, ENTONCES LA Caja DEBERÁ rechazar la Venta, mostrar un mensaje indicando que el Turno fue cerrado, conservar el Carrito y mostrar la pantalla de apertura de turno.
14. DONDE la apertura del cajón al cobrar en efectivo está activada en el Modulo_Parametrizacion, CUANDO se registra una Venta con Metodo_Pago de efectivo, LA Caja DEBERÁ solicitar la apertura del cajón al Agente_Cajon. Si el Agente_Cajon no responde, LA Caja DEBERÁ mostrar un aviso y mantener registrada la Venta.
15. CUANDO se registra una Venta, LA Caja DEBERÁ vaciar el Carrito y mostrar una confirmación con el total y el cambio. La confirmación DEBERÁ cerrarse sola a los 3 segundos o antes, si la Persona_Caja la cierra.
16. LA Caja DEBERÁ registrar las Ventas sin modificar existencias ni inventarios.

### Requirement 7: Anulación de ventas

**User Story:** Como persona que atiende, quiero anular una venta equivocada del turno, para que los totales queden correctos.

#### Acceptance Criteria

1. MIENTRAS existe un Turno_Abierto, LA Caja DEBERÁ mostrar la lista de todas las Ventas del Turno_Abierto, ordenadas de la más reciente a la más antigua, con hora local (Dia_Local, formato HH:mm), total en COP sin decimales, Metodo_Pago y estado ("Registrada" o "Anulada"), y DEBERÁ mostrar las Venta_Anulada con una etiqueta "Anulada" visible y sin la opción de anular.
2. CUANDO la Persona_Caja confirma la anulación de una Venta no anulada del Turno_Abierto, indicando un motivo de 3 a 200 caracteres (sin contar espacios al inicio y al final) y una Persona_Caja escogida de la lista configurada o escrita como nombre libre de 1 a 60 caracteres, LA Caja DEBERÁ cambiar el estado de la Venta a `anulada` y guardar el motivo, la Persona_Caja y la fecha y hora de anulación.
3. LA Caja DEBERÁ conservar sin cambios los datos de la Venta_Anulada (cabecera, Metodo_Pago, efectivo recibido, cambio y total) y de todos sus Detalle_Venta (producto, cantidad, precio unitario y subtotal).
4. CUANDO se registra la anulación de una Venta, LA Caja DEBERÁ excluir la Venta_Anulada del total del Turno, del Efectivo_Esperado, del efectivo disponible para Gastos y de los reportes de ventas, y DEBERÁ mostrar los totales recalculados del Turno_Abierto sin que la Persona_Caja tenga que recargar la página.
5. SI la Venta pertenece a un Turno cerrado al momento de confirmar la anulación, incluso cuando el Turno se cerró desde otro dispositivo, ENTONCES LA Caja DEBERÁ rechazar la anulación, mantener la Venta sin cambios y mostrar un mensaje indicando que el Turno ya fue cerrado.
6. SI el motivo tiene menos de 3 o más de 200 caracteres (sin contar espacios al inicio y al final) o falta la Persona_Caja, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error junto al campo inválido, mantener la Venta con su estado actual y conservar los datos escritos en el formulario de anulación.
7. SI la Venta ya está en estado `anulada` al momento de confirmar la anulación, incluso cuando se anuló desde otro dispositivo, ENTONCES LA Caja DEBERÁ rechazar la nueva anulación, conservar el motivo, la Persona_Caja y la fecha y hora de la primera anulación, y mostrar un mensaje indicando que la Venta ya fue anulada.
8. SI el registro de la anulación falla o se pierde la conexión, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error, mantener la Venta con su estado anterior y conservar el motivo y la Persona_Caja en pantalla para reintentar.

### Requirement 8: Gastos diarios

**User Story:** Como persona que atiende, quiero registrar los gastos pagados con el efectivo de la caja, para que el cierre cuadre.

#### Acceptance Criteria

1. MIENTRAS existe un Turno_Abierto, LA Caja DEBERÁ permitir registrar un Gasto con estos campos: valor entero entre 1 y 10.000.000 COP; concepto de 1 a 120 caracteres, contados después de quitar los espacios al inicio y al final; una Categoria_Gasto activa; y la Persona_Caja que lo registra, escogida de la lista de Persona_Caja activas o escrita como nombre libre de 1 a 60 caracteres.
2. CUANDO la Persona_Caja confirma un Gasto que cumple todas las reglas del criterio 1, LA Caja DEBERÁ registrar el Gasto asociado al Turno_Abierto con valor, concepto, Categoria_Gasto, Persona_Caja y fecha y hora de registro, mostrar una confirmación de registro, limpiar el formulario y agregar el Gasto a la lista de Gastos del Turno_Abierto en un máximo de 2 segundos.
3. SI el valor del Gasto es menor a 1, mayor a 10.000.000, no es un número entero, o faltan el concepto, la Categoria_Gasto o la Persona_Caja, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error junto a cada campo inválido, conservar los datos escritos en el formulario y no registrar el Gasto.
4. SI el valor del Gasto supera el efectivo disponible, calculado como Base_Caja + suma de Ventas no anuladas con Metodo_Pago de efectivo del Turno_Abierto − suma de Gastos ya registrados en el Turno_Abierto, ENTONCES LA Caja DEBERÁ mostrar una advertencia con el efectivo disponible y el valor del Gasto, y pedir confirmación. Si la Persona_Caja confirma, LA Caja DEBERÁ registrar el Gasto. Si cancela, LA Caja DEBERÁ no registrarlo y conservar los datos del formulario.
5. CUANDO la Persona_Caja elimina un Gasto del Turno_Abierto y confirma en el diálogo de confirmación, LA Caja DEBERÁ quitar el Gasto de la lista de Gastos y descontarlo del total de Gastos y del Efectivo_Esperado del Turno_Abierto. Si la Persona_Caja cancela el diálogo, LA Caja DEBERÁ conservar el Gasto sin cambios.
6. MIENTRAS existe un Turno_Abierto, LA Caja DEBERÁ mostrar la lista de Gastos del Turno_Abierto ordenada del más reciente al más antiguo, con hora (Dia_Local, formato de 24 horas), concepto, Categoria_Gasto y valor en COP sin decimales, y el total de Gastos igual a la suma de los valores de todos los Gastos de la lista.
7. SI el registro o la eliminación de un Gasto falla, ENTONCES LA Caja DEBERÁ mostrar un mensaje de error indicando que la operación no se guardó, conservar los datos del formulario o el Gasto en la lista, y dejar sin cambios los Gastos guardados del Turno.
8. SI el Turno ya fue cerrado o no existe un Turno_Abierto al confirmar el registro o la eliminación de un Gasto, ENTONCES LA Caja DEBERÁ rechazar la operación, mostrar un mensaje indicando que el Turno ya fue cerrado y mostrar la pantalla de apertura de turno.

### Requirement 9: Adaptación al espacio disponible

**User Story:** Como persona que atiende, quiero que la Caja aproveche toda la pantalla del equipo que use, para tocar los productos con facilidad.

#### Acceptance Criteria

1. CUANDO la Caja se carga, EL Gestor_Layout DEBERÁ leer `window.innerWidth` y `window.innerHeight` y calcular el número de columnas de la cuadrícula, el ancho del panel del Carrito y la altura disponible antes de mostrar la cuadrícula de productos, para cualquier `window.innerWidth` entre 320 px y 3840 px y cualquier `window.innerHeight` entre 480 px y 2160 px.
2. CUANDO ocurre un evento `resize` u `orientationchange`, EL Gestor_Layout DEBERÁ recalcular el layout una sola vez, a más tardar 200 ms después del último evento de la serie.
3. MIENTRAS `window.innerWidth` es menor a 768 px, LA Caja DEBERÁ mostrar la cuadrícula a todo el ancho de la ventana y el Carrito como una barra fija en la parte inferior, de al menos 56 px de alto, con el total en COP y la cantidad de artículos del Carrito.
4. MIENTRAS `window.innerWidth` es menor a 768 px, CUANDO la Persona_Caja toca la barra inferior del Carrito, LA Caja DEBERÁ expandir el Carrito sobre la cuadrícula hasta un máximo del 85 % de `window.innerHeight` y mostrar un botón para contraerlo de nuevo a la barra inferior.
5. MIENTRAS `window.innerWidth` es mayor o igual a 768 px, LA Caja DEBERÁ mostrar la cuadrícula a la izquierda y el Carrito a la derecha, lado a lado y siempre visibles, con el panel del Carrito al 30 % de `window.innerWidth`, con un mínimo de 300 px y un máximo de 420 px.
6. EL Gestor_Layout DEBERÁ calcular el número de columnas de modo que cada tarjeta de producto, con los espacios entre tarjetas ya descontados, mida entre 120 px y 200 px de ancho, con un mínimo de 2 columnas en todo `window.innerWidth` de 320 px o más.
7. LA Caja DEBERÁ ocupar exactamente la altura de `window.innerHeight` sin barra de desplazamiento de la página, desplazando en vertical solo la cuadrícula de productos y la lista de líneas del Carrito.
8. LA Caja DEBERÁ mantener todos los botones táctiles, incluidas las tarjetas de producto y los controles de cantidad del Carrito, con un tamaño mínimo de 44 × 44 px en cualquier tamaño de ventana entre los límites del criterio 1.
9. CUANDO el Gestor_Layout recalcula el layout, LA Caja DEBERÁ conservar sin cambios las líneas y cantidades del Carrito, el texto del buscador, el filtro de categoría seleccionado y cualquier cobro en curso.
10. SI `window.innerWidth` cruza el límite de 768 px mientras el Carrito está expandido en la barra inferior, ENTONCES LA Caja DEBERÁ mostrar el Carrito como panel lateral y conservar su contenido.

### Requirement 10: Fotos de productos

**User Story:** Como administrador, quiero subir una foto sencilla de cada producto, para que en la Caja se reconozcan rápido.

#### Acceptance Criteria

1. EL Panel_Admin DEBERÁ permitir subir, reemplazar y quitar la foto de cada producto desde la gestión de productos, con un máximo de una foto por producto.
2. CUANDO el administrador escoge una imagen JPEG, PNG o WebP, EL Procesador_Fotos DEBERÁ corregir la orientación según los datos EXIF, reducir la imagen sin recortar para que su lado más largo mida como máximo 600 px (sin ampliar las imágenes cuyo lado más largo ya mide 600 px o menos), convertirla a WebP con calidad 0,8 y mostrar una vista previa del resultado antes de subirla.
3. SI el archivo escogido no es JPEG, PNG ni WebP, el navegador no puede leerlo como imagen o pesa más de 25 MB, ENTONCES EL Procesador_Fotos DEBERÁ rechazarlo, mostrar un mensaje de error que indique el motivo (formato no admitido, archivo dañado o tamaño mayor a 25 MB), no subir ningún archivo y conservar la foto actual del producto.
4. SI el navegador no puede generar WebP, ENTONCES EL Procesador_Fotos DEBERÁ mostrar un mensaje indicando que use otro navegador, no subir el archivo y conservar la foto actual del producto.
5. SI el archivo WebP resultante pesa más de 300 KB, ENTONCES EL Procesador_Fotos DEBERÁ repetir la conversión bajando la calidad en pasos de 0,1 (0,7, 0,6 y 0,5) y, si con calidad 0,5 sigue pesando más de 300 KB, rechazar la foto, mostrar un mensaje de error indicando que la imagen es demasiado pesada y conservar la foto actual del producto.
6. CUANDO la conversión termina y el administrador confirma la foto, EL Panel_Admin DEBERÁ subir el archivo al Bucket_Productos en la ruta `{productoId}-{marcaDeTiempo}.webp` con tipo `image/webp` y guardar la ruta en el campo `imagen_path` del producto.
7. CUANDO el campo `imagen_path` queda actualizado con la foto nueva, o vacío porque se quitó la foto, EL Panel_Admin DEBERÁ eliminar del Bucket_Productos el archivo anterior. Si esa eliminación falla, el producto conserva la foto nueva (o queda sin foto) y no se muestra error al administrador.
8. SI la subida al Bucket_Productos falla o tarda más de 30 segundos, o si falla la actualización de `imagen_path` después de la subida, ENTONCES EL Panel_Admin DEBERÁ mostrar un mensaje de error, eliminar del Bucket_Productos el archivo nuevo si llegó a subirse y conservar sin cambios la foto anterior y el campo `imagen_path` del producto.
9. MIENTRAS el Procesador_Fotos convierte la imagen o EL Panel_Admin sube el archivo, EL Panel_Admin DEBERÁ mostrar un indicador de progreso y mantener deshabilitados los botones de subir, reemplazar y quitar foto de ese producto.
10. CUANDO el administrador toca "Quitar foto", EL Panel_Admin DEBERÁ pedir confirmación antes de dejar vacío el campo `imagen_path` del producto.
11. LA Caja DEBERÁ mostrar las fotos usando la URL pública del Bucket_Productos y, si la imagen no carga, mostrar la imagen de reemplazo con la inicial del nombre del producto descrita en el Requisito 4.

### Requirement 11: Acceso a Reportes desde Administración

**User Story:** Como administrador, quiero un botón de Reportes dentro de Administración, para ver las ventas sin perder lo que ya tengo.

#### Acceptance Criteria

1. EL Panel_Admin DEBERÁ conservar la configuración de producción y la gestión de inventarios existentes con las mismas opciones, campos y acciones que tenían antes de agregar el botón "Reportes".
2. EL Panel_Admin DEBERÁ mostrar un botón "Reportes" que navega al Modulo_Reportes en la ruta `/admin/reportes`.
3. EL Modulo_Reportes DEBERÁ organizar el contenido en siete secciones seleccionables (Resumen, Ventas, Productos, Turnos, Gastos, Métodos de pago y Configuración) y mostrar una sola sección a la vez, con la sección seleccionada resaltada.
4. EL Modulo_Reportes DEBERÁ ofrecer un filtro de rango de fechas con fecha inicial y fecha final inclusivas y con atajos calculados por Dia_Local: Hoy (el Dia_Local actual), Ayer (el Dia_Local anterior), Últimos 7 días (el Dia_Local actual y los 6 anteriores), Este mes (desde el día 1 del mes actual hasta el Dia_Local actual) y Mes anterior (desde el primer hasta el último día del mes calendario anterior).
5. CUANDO el administrador abre el Modulo_Reportes, EL Modulo_Reportes DEBERÁ mostrar la sección Resumen con el rango Hoy seleccionado.
6. CUANDO el administrador cambia de sección, EL Modulo_Reportes DEBERÁ conservar el rango de fechas elegido; y CUANDO el administrador cambia el rango, EL Modulo_Reportes DEBERÁ recalcular las cifras de la sección visible con el nuevo rango.
7. SI la fecha inicial es posterior a la fecha final, falta alguna de las dos fechas o el rango supera 366 días, ENTONCES EL Modulo_Reportes DEBERÁ mostrar un mensaje de error junto al filtro, no aplicar el rango y conservar las cifras del último rango válido.

### Requirement 12: Reportes de ventas

**User Story:** Como administrador, quiero ver reportes de ventas, productos, turnos y gastos, para entender cómo va el negocio.

#### Acceptance Criteria

1. CUANDO el administrador elige un rango de fechas, LA sección Resumen DEL Modulo_Reportes DEBERÁ mostrar para ese rango: total vendido (suma de los totales de las Ventas que no son Venta_Anulada), número de Ventas que no son Venta_Anulada, valor promedio por Venta (total vendido ÷ número de Ventas, redondeado al peso entero más cercano y mostrado como 0 cuando no hay Ventas), total de Gastos y total vendido − total de Gastos, que puede ser negativo.
2. LA sección Ventas DEL Modulo_Reportes DEBERÁ mostrar una fila por cada Dia_Local del rango que tenga al menos una Venta, con el total vendido y el número de Ventas de ese día, y la lista de Ventas que no son Venta_Anulada ordenada de la más reciente a la más antigua, con hora local, total y Metodo_Pago. CUANDO el administrador selecciona una Venta, la sección DEBERÁ mostrar sus Detalle_Venta (producto, cantidad, precio unitario guardado y subtotal), el efectivo recibido y el cambio.
3. LA sección Productos DEL Modulo_Reportes DEBERÁ mostrar una fila por producto con al menos un Detalle_Venta de Ventas que no son Venta_Anulada en el rango, con la cantidad vendida (suma de cantidades) y el valor vendido (suma de subtotales), ordenadas de mayor a menor valor vendido y, a igual valor, por nombre de forma alfabética ascendente.
4. LA sección Turnos DEL Modulo_Reportes DEBERÁ mostrar una fila por cada Turno cuya apertura cae en un Dia_Local del rango, con: Persona_Caja de apertura y de cierre, horas locales de apertura y cierre, Base_Caja, ventas por Metodo_Pago sin Venta_Anulada, total de Gastos, Efectivo_Esperado, efectivo contado y Diferencia_Cierre. SI el Turno es un Turno_Abierto, ENTONCES la fila DEBERÁ mostrar el estado "Abierto" y dejar vacíos la Persona_Caja de cierre, la hora de cierre, el efectivo contado y la Diferencia_Cierre.
5. LA sección Gastos DEL Modulo_Reportes DEBERÁ mostrar los Gastos del rango ordenados del más reciente al más antiguo, con hora local, concepto, Categoria_Gasto, Persona_Caja y valor, y una fila de total por cada Categoria_Gasto con al menos un Gasto en el rango, incluyendo las Categoria_Gasto desactivadas.
6. LA sección Métodos de pago DEL Modulo_Reportes DEBERÁ mostrar, por cada Metodo_Pago con al menos una Venta que no es Venta_Anulada en el rango, incluyendo los Metodo_Pago desactivados, el total vendido y el número de Ventas.
7. LA sección Ventas DEL Modulo_Reportes DEBERÁ mostrar las Venta_Anulada del rango en una lista aparte, ordenada de la más reciente a la más antigua, con hora local de la Venta, total, motivo, Persona_Caja que anuló y fecha y hora local de anulación, y DEBERÁ excluir esas Ventas de todos los totales y conteos del Modulo_Reportes.
8. EL Modulo_Reportes DEBERÁ asignar cada Venta y cada Gasto al Dia_Local de su fecha y hora de registro, e incluir en el rango todos los registros desde las 00:00:00 del Dia_Local inicial hasta las 23:59:59 del Dia_Local final, ambos inclusive.
9. PARA TODO rango de fechas, la suma de los totales por Dia_Local, la suma de los valores vendidos por producto y la suma de los totales por Metodo_Pago DEBERÁN ser iguales al total vendido de la sección Resumen, y la suma de los totales por Categoria_Gasto DEBERÁ ser igual al total de Gastos de la sección Resumen.
10. MIENTRAS el rango elegido no tiene Ventas ni Gastos, EL Modulo_Reportes DEBERÁ mostrar un estado vacío con el mensaje "Sin movimientos en este rango" en las secciones Resumen, Ventas, Productos, Gastos y Métodos de pago, en lugar de tablas vacías.
11. CUANDO el administrador cambia el rango de fechas, EL Modulo_Reportes DEBERÁ actualizar todas las cifras de la sección visible con los datos del nuevo rango en un máximo de 5 segundos para rangos de hasta 31 días, mostrando un indicador de carga mientras tanto.
12. SI la fecha inicial del rango es posterior a la fecha final, ENTONCES EL Modulo_Reportes DEBERÁ mostrar un mensaje de error junto al filtro, no consultar datos y conservar las cifras del último rango válido.
13. SI la consulta de datos de un reporte falla o no hay conexión, ENTONCES EL Modulo_Reportes DEBERÁ mostrar un mensaje de error con un botón "Reintentar" y no mostrar cifras parciales ni de un rango distinto al elegido.

### Requirement 13: Exportación de reportes

**User Story:** Como administrador, quiero descargar los reportes, para guardarlos o compartirlos.

#### Acceptance Criteria

1. LAS secciones Resumen, Ventas, Productos, Turnos, Gastos y Métodos de pago DEL Modulo_Reportes DEBERÁN mostrar los botones "Descargar PDF" y "Descargar CSV", y la sección Configuración NO DEBERÁ mostrarlos.
2. CUANDO el administrador toca "Descargar PDF" en una sección, EL Modulo_Reportes DEBERÁ descargar, en un máximo de 10 segundos para hasta 5.000 filas, un archivo PDF llamado `reporte-{seccion}-{desde}-{hasta}.pdf` (fechas en formato AAAA-MM-DD según Dia_Local). El PDF DEBERÁ contener el logo SVG de Panadería LIZPAN, el nombre de la sección, el rango de fechas aplicado, la fecha y hora de generación en Dia_Local y las mismas cifras y filas mostradas en pantalla con el filtro vigente, con los montos en COP sin decimales en el formato de `formatCurrency`, y DEBERÁ continuar en páginas adicionales cuando las filas no caben en una sola página.
3. CUANDO el administrador toca "Descargar CSV" en una sección, EL Modulo_Reportes DEBERÁ descargar, en un máximo de 10 segundos para hasta 5.000 filas, un archivo llamado `reporte-{seccion}-{desde}-{hasta}.csv` en UTF-8 con BOM y separado por comas. El archivo DEBERÁ tener una fila de encabezados con los mismos nombres de columna mostrados en pantalla y una fila por cada fila de la tabla de la sección con el filtro vigente. En la sección Ventas DEBERÁ haber una fila por Venta, incluidas las Venta_Anulada con su estado, motivo y Persona_Caja. En la sección Resumen DEBERÁ haber una fila por indicador.
4. LA Aplicacion DEBERÁ escribir en el CSV los montos como enteros de COP sin símbolo de moneda ni separador de miles, y las fechas y horas en Dia_Local con formato `AAAA-MM-DD HH:mm`.
5. PARA TODO reporte exportado a CSV, leer el CSV DEBERÁ producir los mismos valores, en el mismo orden de filas y columnas, que la tabla mostrada en pantalla (propiedad de ida y vuelta). Esto incluye textos con comas, comillas dobles, saltos de línea y tildes. Para lograrlo, los campos que contengan comas, comillas o saltos de línea DEBERÁN ir entre comillas dobles, con las comillas internas duplicadas.
6. MIENTRAS el rango elegido muestra el estado vacío "Sin movimientos en este rango", EL Modulo_Reportes DEBERÁ mantener deshabilitados los botones "Descargar PDF" y "Descargar CSV".
7. SI la generación o la descarga del PDF o del CSV falla, ENTONCES EL Modulo_Reportes DEBERÁ mostrar un mensaje de error indicando que no se pudo generar el archivo, no descargar un archivo parcial y conservar la sección, el rango de fechas y los datos mostrados en pantalla.

### Requirement 14: Parametrización

**User Story:** Como administrador, quiero configurar las opciones de la Caja, para adaptarla a cómo trabaja la panadería.

#### Acceptance Criteria

1. EL Modulo_Parametrizacion DEBERÁ permitir crear, editar, activar, desactivar y ordenar Metodo_Pago, con un nombre de 1 a 40 caracteres que no se repita entre Metodo_Pago (sin distinguir mayúsculas, minúsculas ni tildes), un indicador sí/no de efectivo y un orden entero de 0 a 999.
2. SI desactivar un Metodo_Pago o quitarle la marca de efectivo dejaría sin ningún Metodo_Pago activo marcado como efectivo, ENTONCES EL Modulo_Parametrizacion DEBERÁ rechazar el cambio, mostrar un mensaje indicando que debe existir al menos un Metodo_Pago de efectivo activo y conservar el estado anterior.
3. EL Modulo_Parametrizacion DEBERÁ permitir crear, editar, activar y desactivar Categoria_Gasto, con un nombre de 1 a 40 caracteres que no se repita entre Categoria_Gasto (sin distinguir mayúsculas, minúsculas ni tildes).
4. EL Modulo_Parametrizacion DEBERÁ permitir crear, editar, activar y desactivar Persona_Caja, con un nombre de 1 a 60 caracteres que no se repita entre Persona_Caja (sin distinguir mayúsculas, minúsculas ni tildes).
5. EL Modulo_Parametrizacion DEBERÁ permitir definir la Base_Caja por defecto como un entero de 0 a 10.000.000 COP. Mientras no se haya definido, la Base_Caja por defecto será 0.
6. EL Modulo_Parametrizacion DEBERÁ listar todos los productos con `tipo_producto` distinto de `materia_prima` y permitir marcar cada uno como visible o no visible en Caja y asignarle un orden entero de 0 a 9999. Los productos sin configuración se consideran visibles con orden 0.
7. EL Modulo_Parametrizacion DEBERÁ ofrecer dos opciones independientes, ambas activadas por defecto: apertura del cajón al registrar una Venta en efectivo y apertura del cajón al abrir o cerrar un Turno.
8. CUANDO se desactiva un Metodo_Pago, una Categoria_Gasto o una Persona_Caja, EL Modulo_Parametrizacion DEBERÁ conservar sin cambios las Ventas, Gastos y Turnos que lo usan, seguir mostrándolo en los reportes de esos registros y ocultarlo de las selecciones de la Caja desde la siguiente carga de la pantalla de Caja.
9. SI un valor de configuración está vacío, se sale de los rangos de los criterios 1 a 6, no es entero cuando debe serlo o repite un nombre existente, ENTONCES EL Modulo_Parametrizacion DEBERÁ mostrar un mensaje de error junto al campo indicando la regla incumplida, no guardar el cambio y conservar el valor anterior.
10. CUANDO el administrador guarda un cambio válido, EL Modulo_Parametrizacion DEBERÁ mostrar una confirmación de guardado, y LA Caja DEBERÁ usar el nuevo valor desde la siguiente carga de la pantalla de Caja.
11. MIENTRAS una de las opciones de apertura del cajón del criterio 7 está desactivada, LA Caja NO DEBERÁ solicitar la apertura del cajón al Agente_Cajon en el evento que esa opción controla.
12. SI falla el guardado de un cambio de configuración por error de conexión o de base de datos, ENTONCES EL Modulo_Parametrizacion DEBERÁ mostrar un mensaje de error, conservar el valor anterior guardado y mantener en pantalla el valor escrito para reintentar.
13. EL Modulo_Parametrizacion DEBERÁ permitir asignar a cada producto que no sea `materia_prima` una categoría de la tabla `categorias` existente o dejarlo sin categoría.

### Requirement 15: Protección del Modulo_Reportes con PIN opcional

**User Story:** Como administrador, quiero proteger los reportes con un PIN, para que quien atiende la Caja no vea ni cambie la configuración.

#### Acceptance Criteria

1. DONDE el PIN_Admin está configurado, CUANDO un usuario con sesión válida en la Aplicacion abre el Modulo_Reportes, ya sea con el botón "Reportes" o escribiendo la ruta `/admin/reportes`, EL Modulo_Reportes DEBERÁ mostrar solo un campo para ingresar el PIN_Admin. Mientras el PIN_Admin no se haya verificado, no DEBERÁ mostrar ninguna sección (Resumen, Ventas, Productos, Turnos, Gastos, Métodos de pago, Configuración), ni cifras, ni las opciones "Descargar PDF" y "Descargar CSV".
2. DONDE el PIN_Admin está configurado, CUANDO se ingresa el PIN_Admin correcto, EL Modulo_Reportes DEBERÁ mostrar las secciones y reiniciar a 0 el conteo de intentos fallidos. El acceso DEBERÁ durar hasta que se cierre la sesión del navegador o pasen 8 horas desde la verificación, lo que ocurra primero. Después de eso, EL Modulo_Reportes DEBERÁ pedir el PIN_Admin otra vez antes de mostrar o actualizar cualquier sección.
3. DONDE el PIN_Admin está configurado, SI se ingresa un PIN_Admin incorrecto 5 veces seguidas en el mismo navegador, ENTONCES EL Modulo_Reportes DEBERÁ bloquear nuevos intentos en ese navegador durante 5 minutos contados desde el quinto intento fallido. Durante el bloqueo DEBERÁ mostrar un mensaje con el tiempo de espera restante. Al terminar los 5 minutos DEBERÁ permitir intentar de nuevo con el conteo reiniciado a 0.
4. EL Modulo_Parametrizacion DEBERÁ permitir crear, cambiar o quitar el PIN_Admin. Un PIN_Admin nuevo DEBERÁ tener solo dígitos del 0 al 9, con una longitud de 4 a 8 dígitos. Para cambiar o quitar un PIN_Admin existente DEBERÁ pedir primero el PIN_Admin actual.
5. LA Aplicacion DEBERÁ guardar el PIN_Admin solo como hash en la tabla `configuracion` y verificarlo mediante una función RPC de base de datos. LA Aplicacion no DEBERÁ guardar el PIN_Admin en texto claro en la base de datos ni en el almacenamiento del navegador.
6. DONDE el PIN_Admin no está configurado, EL Modulo_Reportes DEBERÁ mostrar las secciones a cualquier usuario con sesión válida en la Aplicacion, sin pedir PIN.
7. DONDE el PIN_Admin está configurado, SI se ingresa un PIN_Admin incorrecto y todavía no se llega a 5 intentos fallidos seguidos, ENTONCES EL Modulo_Reportes DEBERÁ mostrar un mensaje de error con el número de intentos que quedan, limpiar el campo y seguir ocultando las secciones.
8. SI la función RPC de verificación del PIN_Admin falla o no responde en 10 segundos, ENTONCES EL Modulo_Reportes DEBERÁ mostrar un mensaje de error indicando que no se pudo verificar el PIN, seguir ocultando las secciones y no contar ese intento como fallido.
9. SI al crear o cambiar el PIN_Admin el valor nuevo tiene caracteres que no son dígitos o menos de 4 o más de 8 dígitos, o si el PIN_Admin actual ingresado es incorrecto, ENTONCES EL Modulo_Parametrizacion DEBERÁ mostrar un mensaje de error indicando la causa y conservar sin cambios el PIN_Admin guardado (o la ausencia de PIN).

### Requirement 16: Diseño visual y logo

**User Story:** Como dueña de la panadería, quiero que la Caja siga el diseño hecho en Stitch, para que se vea como la imaginé.

#### Acceptance Criteria

1. LA Caja DEBERÁ usar solo los colores definidos en `diseno/paleta` y en el código de `diseno/stitch/codigo` para fondos, textos, bordes y botones, y DEBERÁ usar las familias de fuente definidas en esos mismos archivos para títulos y textos.
2. LA Caja DEBERÁ conservar la posición relativa de las zonas principales que aparecen en `diseno/stitch/pantallas` (encabezado, buscador y filtro de categorías, cuadrícula de productos, Carrito con total y botón "Cobrar"). Se pueden agregar o quitar elementos dentro de cada zona siempre que la pantalla de ventas siga mostrando esas zonas.
3. LA Aplicacion DEBERÁ incluir un logo de Panadería LIZPAN en formato SVG, guardado tanto en `diseno/logo` como en `public`. El logo DEBERÁ contener el texto "LIZPAN", usar solo colores de la paleta de Stitch y no incluir imágenes rasterizadas.
4. LA Caja y EL Modulo_Reportes DEBERÁN mostrar el logo SVG en su encabezado con una altura entre 32 px y 64 px, sin deformar su proporción.
5. LA Aplicacion DEBERÁ aplicar la paleta y las fuentes de Stitch solo a la Caja y al Modulo_Reportes. Los colores, fuentes y distribución de `/login` y de `/` DEBERÁN verse igual antes y después del cambio.
6. SI una fuente de Stitch no carga en el navegador, ENTONCES LA Caja DEBERÁ mostrar el texto con una fuente de respaldo del sistema y conservar visibles y usables todos los elementos de la pantalla.
7. SI el archivo del logo SVG no carga, ENTONCES LA Caja y EL Modulo_Reportes DEBERÁN mostrar en el encabezado el texto "Panadería LIZPAN" en lugar del logo.

### Requirement 17: Restricciones de plataforma y datos

**User Story:** Como dueña de la panadería, quiero que el sistema funcione en la infraestructura actual sin costos extra, para no pagar más.

#### Acceptance Criteria

1. LA Aplicacion DEBERÁ funcionar con el despliegue actual en Vercel y el proyecto actual de Supabase en plan gratuito, sin requerir un plan de pago de Vercel o de Supabase ni servicios externos distintos de Vercel, Supabase y el Agente_Cajon.
2. LA Aplicacion DEBERÁ entregar todos los cambios de base de datos de esta funcionalidad en un único archivo `supabase/migration-*.sql`, ejecutado manualmente, de forma que una segunda ejecución sobre la misma base termine sin error y sin crear filas, tablas, columnas, políticas ni funciones duplicadas (incluidos los Metodo_Pago y las Categoria_Gasto iniciales).
3. CUANDO se aplica la migración, LA Aplicacion DEBERÁ conservar en las tablas de productos, inventarios, detalles, facturas y configuración el mismo número de filas y los mismos valores en las columnas existentes, sin eliminar ni renombrar columnas existentes.
4. LA Aplicacion DEBERÁ guardar los valores monetarios de Ventas, Detalle_Venta, Gastos y Turnos como enteros de COP o como decimales con 2 posiciones cuya parte decimal sea siempre ,00, con valores entre 0 y 99.999.999 COP (la Diferencia_Cierre entre −99.999.999 y 99.999.999 COP), y mostrarlos con `formatCurrency` sin decimales.
5. LA Aplicacion DEBERÁ guardar fechas y horas en UTC y asignar cada Venta, Gasto y Turno al Dia_Local que resulta de convertir la hora UTC a America/Bogota (UTC−5), de forma que un registro hecho a las 04:30 UTC del día D quede en el Dia_Local D−1.
6. LA Aplicacion DEBERÁ requerir conexión a internet para registrar Ventas, Gastos, anulaciones y aperturas y cierres de Turno, sin guardar registros pendientes para enviarlos después.
7. SI el navegador indica que no hay conexión o el servidor no responde dentro de 15 segundos al registrar una Venta, un Gasto, una anulación o una apertura o cierre de Turno, ENTONCES LA Caja DEBERÁ mostrar un mensaje de "Sin conexión", conservar en pantalla los datos ingresados (Carrito, Metodo_Pago, efectivo recibido, campos del Gasto o del Turno) y ofrecer un botón para reintentar.
8. SI la Persona_Caja reintenta un registro cuya respuesta no llegó pero que sí quedó guardado en la base de datos, ENTONCES LA Caja DEBERÁ conservar un único registro de esa Venta, Gasto o Turno, sin duplicarlo.
9. SI un registro de Venta, Gasto o Turno falla por pérdida de conexión, ENTONCES LA Aplicacion DEBERÁ dejar la base de datos sin registros parciales de esa operación (por ejemplo, una cabecera de Venta sin sus Detalle_Venta).

## Decisiones abiertas

- **Entrada a la Caja**: se recomienda la ruta directa `/caja` (guardable como acceso directo de PWA o en la pantalla del equipo de caja) más el botón "Ir a Caja" en `/admin`. Requisito 1 refleja esta recomendación; confirmar si se prefiere el nombre `/ventas`.
- **Protección de Reportes**: la Aplicacion hoy tiene una sola contraseña compartida y no tiene roles. Se recomienda el PIN_Admin opcional del Requisito 15. Confirmar si se quiere usar o si basta con la contraseña actual.
- **Personas de caja**: el Requisito 2 permite lista configurable y nombre libre. Confirmar si se prefiere solo la lista.
- **Anulación de ventas de turnos cerrados**: hoy queda rechazada (Requisito 7.5). Confirmar si el administrador debe poder anularlas desde Reportes.
- **Categorías de producto**: el filtro de categoría (Req 4.6) usa la tabla `categorias` existente, pero hoy los productos no tienen categoría asignada en la UI. Opciones: agregar al Modulo_Parametrizacion la asignación de categoría a productos (recomendado, la tabla y la columna `categoria_id` ya existen), filtrar por `tipo_producto`, o quitar el filtro.
