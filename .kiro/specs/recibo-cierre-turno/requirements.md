# Requirements Document

## Introduction

Recibo impreso al cerrar el turno en la Caja de Panadería Lizpan, en la impresora térmica de 80 mm que ya usa el Agente_Cajon.

Pedido del usuario: "al cerrar el turno necesito que me saque un recibo, una impresión en impresora térmica de 80 mm. Al cerrar turno sacar un resumen de las ventas, gastos, el dinero y un resumen de productos también; puede ser la info de la panadería arriba: PANADERIA LIZPAN barrio los Alcazares".

Resumen del comportamiento aprobado:

- **Impresión directa:** el Agente_Cajon recibe una ruta nueva `POST /imprimir` con los bytes ESC/POS del recibo y los manda en modo RAW a la impresora. Los bytes se arman en el cliente con un módulo puro.
- **Datos desde el servidor:** una RPC nueva `recibo_cierre(p_turno)` devuelve los datos del Recibo_Cierre solo para turnos cerrados, incluidos el efectivo esperado y la diferencia, aunque la pantalla de cierre siga siendo a ciegas.
- **Cuándo:** se imprime solo al cerrar el turno y la pantalla de resultado del cierre tiene el botón "Imprimir recibo" para reimprimir. Si la impresión falla, el cierre queda hecho igual.
- **Opcional:** botón "Imprimir recibo" por turno cerrado en Reportes > Turnos.

### Decisiones registradas

1. **Formato del cuerpo:** el cliente manda los bytes en base64 como texto plano (`text/plain`), así el `fetch` sigue siendo una petición simple sin preflight. El agente lee el cuerpo según `Content-Length`, con un máximo de 65.536 bytes de cuerpo.
2. **Página de códigos:** PC850 (`ESC t 2`) para tildes, ñ, ¿ y ¡. Los caracteres que no están en PC850 se imprimen sin tilde o como `?`.
3. **Encabezado:** "PANADERIA LIZPAN" y "Barrio Los Alcázares" como constantes en `src/lib/recibo/config.ts`. No hay una tabla de configuración adecuada para textos, así que no se agrega a la base de datos.
4. **Seguridad del agente:** se conservan las tres reglas actuales (solo 127.0.0.1, solo orígenes de `config.json`, solo Host 127.0.0.1/localhost). `/abrir` y `/estado` no cambian.

## Glossary

- **Sistema_Caja**: la aplicación cliente Next 14 de la Caja (`/caja`) junto con las funciones RPC que usa.
- **Servidor**: las funciones SQL `SECURITY DEFINER` de Supabase.
- **Agente_Cajon**: el programa `herramientas/cajon/agente-cajon.ps1` que escucha en 127.0.0.1:17777 y envía bytes RAW a la impresora por la cola de Windows.
- **Turno**: fila de `turnos`; cerrado cuando `cerrado_en` no es nulo.
- **Recibo_Cierre**: impresión de 80 mm con el resumen de un Turno cerrado.
- **Datos_Recibo**: respuesta de la RPC `recibo_cierre` para un Turno cerrado.
- **Generador_Recibo**: módulo puro `src/lib/recibo/` que convierte los Datos_Recibo en líneas de texto y bytes ESC/POS.
- **Linea_Recibo**: una línea de texto del Recibo_Cierre con su estilo (normal, negrita, doble alto o doble ancho y alto) y alineación.
- **Ancho_Linea**: número de caracteres que caben en una Linea_Recibo: 48 en estilo normal, negrita o doble alto; 24 en doble ancho y alto.
- **Pantalla_Resultado**: la pantalla "Turno cerrado" (`ResultadoCierre`) que aparece después de un cierre exitoso.
- **Venta_Por_Valor**: Venta con `tipo = 'valor'`; sus líneas se agrupan en el resumen de productos como "Venta por valor".
- **Gasto_Cajon**: parte de un gasto que sale del cajón (gasto sin orígenes o con origen Cajón).
- **Gasto_Mayor**: parte de un gasto que sale de la caja mayor.
- **Migracion_Recibo**: el archivo `supabase/migration-recibo-cierre.sql`, que el usuario ejecuta a mano en el SQL Editor de Supabase.

## Requirements

### Requirement 1: Datos del recibo desde el Servidor

**User Story:** Como persona de caja, quiero que el recibo traiga las cifras guardadas al cerrar, para que coincida con lo que quedó registrado.

#### Acceptance Criteria

1. WHEN se llama `recibo_cierre` con un Turno cerrado, THE Servidor SHALL devolver: quién abrió, hora de apertura, quién cerró, hora de cierre, base inicial, efectivo esperado, efectivo contado, diferencia, base dejada y enviado a caja mayor, tal como quedaron guardados en el Turno.
2. WHEN se llama `recibo_cierre` con un Turno cerrado, THE Servidor SHALL devolver el total y el número de ventas registradas, el total y el número de ventas anuladas, el total de las Ventas_Por_Valor registradas y una fila por método de pago con total y número de ventas registradas.
3. WHEN se llama `recibo_cierre` con un Turno cerrado, THE Servidor SHALL devolver los gastos no eliminados del Turno con hora, categoría, concepto, valor, parte de Gasto_Cajon y parte de Gasto_Mayor, más el total de gastos, el total de Gasto_Cajon y el total de Gasto_Mayor.
4. WHEN se llama `recibo_cierre` con un Turno cerrado, THE Servidor SHALL devolver la lista de retiros del Turno con hora y valor, y su total.
5. WHEN se llama `recibo_cierre` con un Turno cerrado, THE Servidor SHALL devolver el resumen de productos de las ventas registradas del Turno, con nombre, cantidad y valor por producto, con todas las líneas de Venta_Por_Valor en una sola fila "Venta por valor", ordenado por valor de mayor a menor.
6. WHEN se llama `recibo_cierre` con un Turno cerrado, THE Servidor SHALL devolver los autoconsumos no anulados del Turno agrupados por producto con cantidad y valor de referencia, y su total.
7. IF el Turno no existe, THEN THE Servidor SHALL responder `TURNO_NO_ABIERTO`.
8. IF el Turno sigue abierto, THEN THE Servidor SHALL responder `TURNO_NO_CERRADO`.
9. THE Servidor SHALL permitir ejecutar `recibo_cierre` solo a los roles `anon` y `authenticated`.

### Requirement 2: Contenido del Recibo_Cierre

**User Story:** Como dueña de la panadería, quiero un recibo con ventas, gastos, dinero y productos del turno, para revisar el cierre en papel.

#### Acceptance Criteria

1. THE Generador_Recibo SHALL iniciar el Recibo_Cierre con "PANADERIA LIZPAN" centrado en doble ancho y alto, "Barrio Los Alcázares" centrado y "Cierre de turno" centrado en negrita.
2. THE Generador_Recibo SHALL mostrar debajo del encabezado la fecha de cierre (AAAA-MM-DD), quién abrió con la hora de apertura, quién cerró con la hora de cierre y la hora de impresión, con horas en formato de 12 horas en hora de Bogotá.
3. WHERE la apertura es de un día distinto al cierre, THE Generador_Recibo SHALL mostrar la apertura con fecha y hora.
4. THE Generador_Recibo SHALL mostrar la sección "VENTAS" con el total y número de ventas registradas, una fila por método de pago, el total de Ventas_Por_Valor y el total y número de ventas anuladas.
5. THE Generador_Recibo SHALL mostrar la sección "GASTOS/PEDIDOS" con una fila por gasto (concepto o categoría y valor, marcado "(Caja mayor)" cuando el gasto sale entero de la caja mayor) y los totales de gastos, de Gasto_Cajon y de Gasto_Mayor.
6. THE Generador_Recibo SHALL mostrar la sección "DINERO" con base inicial, ventas en efectivo, gastos del cajón, retiros, efectivo esperado, efectivo contado, diferencia, base dejada y enviado a caja mayor.
7. THE Generador_Recibo SHALL mostrar la diferencia con signo: "+" si sobra, "-" si falta y sin signo si es 0.
8. THE Generador_Recibo SHALL mostrar la sección "PRODUCTOS" con una fila por producto del resumen (cantidad, nombre y valor) y el total.
9. WHERE el Turno tiene autoconsumos, THE Generador_Recibo SHALL mostrar la sección "AUTOCONSUMO" con una fila por producto y el total, con el aviso "Valor de referencia, no es dinero".
10. WHERE una sección no tiene filas, THE Generador_Recibo SHALL mostrar en esa sección el texto "Sin movimientos".
11. THE Generador_Recibo SHALL mostrar todo valor de dinero en pesos colombianos sin decimales con el formato "$ 12.345".
12. THE Generador_Recibo SHALL producir cada Linea_Recibo con una longitud menor o igual a su Ancho_Linea, recortando nombres y conceptos largos y conservando completo el valor de la derecha.

### Requirement 3: Bytes ESC/POS

**User Story:** Como persona de caja, quiero que el recibo salga bien en la térmica, con tildes y cortado, para entregarlo sin arreglos.

#### Acceptance Criteria

1. THE Generador_Recibo SHALL iniciar los bytes con `ESC @` seguido de `ESC t 2` (página de códigos PC850).
2. THE Generador_Recibo SHALL codificar cada carácter de texto con PC850, cambiando cada carácter fuera de PC850 por su letra sin tilde o, si no la tiene, por `?`.
3. THE Generador_Recibo SHALL usar `ESC a` para la alineación y `ESC !` para los estilos de cada Linea_Recibo, y volver al estilo normal después de cada línea con estilo.
4. THE Generador_Recibo SHALL terminar los bytes con un avance de 4 líneas (`ESC d 4`) y el corte de papel `GS V 66 0`.
5. THE Generador_Recibo SHALL producir como máximo 49.152 bytes por Recibo_Cierre.
6. IF los Datos_Recibo producirían más de 49.152 bytes, THEN THE Generador_Recibo SHALL recortar las listas de gastos y de productos y agregar al final de cada lista recortada la línea "... y N más".

### Requirement 4: Ruta de impresión del Agente_Cajon

**User Story:** Como persona de caja, quiero que el mismo agente del cajón imprima el recibo, para no instalar nada más.

#### Acceptance Criteria

1. WHEN el Agente_Cajon recibe `POST /imprimir` de un origen permitido con Host válido y un cuerpo en base64 de 1 a 65.536 bytes, THE Agente_Cajon SHALL decodificar el cuerpo y enviar los bytes en modo RAW a la impresora configurada en un trabajo llamado "Recibo cierre", y responder `{ "ok": true }`.
2. THE Agente_Cajon SHALL leer el cuerpo según el encabezado `Content-Length`, incluidos los bytes del cuerpo que llegaron junto con los encabezados.
3. IF `POST /imprimir` llega sin `Content-Length`, THEN THE Agente_Cajon SHALL responder `411` con `{ "ok": false, "error": "Falta Content-Length" }`.
4. IF `Content-Length` supera 65.536, THEN THE Agente_Cajon SHALL responder `413` con `{ "ok": false, "error": "Recibo muy grande" }` sin leer el cuerpo.
5. IF el cuerpo no es base64 válido, está vacío o llega incompleto antes de 2 segundos, THEN THE Agente_Cajon SHALL responder `400` con `{ "ok": false, "error": "Recibo inválido" }` sin imprimir.
6. IF la impresora no está o falla, THEN THE Agente_Cajon SHALL responder `500` con `{ "ok": false, "error": <motivo> }` y anotar el error en `agente.log`.
7. THE Agente_Cajon SHALL mantener sin cambios el comportamiento de `GET /estado`, `POST /abrir`, `OPTIONS` y las reglas de 127.0.0.1, orígenes permitidos y Host válido para todas las rutas.
8. THE Agente_Cajon SHALL anotar en `agente.log` cada impresión con la impresora, el número de bytes y el origen, sin anotar el contenido.

### Requirement 5: Impresión al cerrar y reimpresión

**User Story:** Como persona de caja, quiero que el recibo salga solo al cerrar y poder volver a imprimirlo, para no depender de acordarme.

#### Acceptance Criteria

1. WHEN aparece la Pantalla_Resultado después de un cierre exitoso, THE Sistema_Caja SHALL pedir los Datos_Recibo del Turno, generar los bytes e imprimir el Recibo_Cierre una sola vez.
2. THE Pantalla_Resultado SHALL mostrar el botón "Imprimir recibo" con una zona táctil de al menos 44 × 44 px.
3. WHEN se toca "Imprimir recibo", THE Sistema_Caja SHALL volver a pedir los Datos_Recibo e imprimir de nuevo el Recibo_Cierre.
4. WHILE se imprime, THE Pantalla_Resultado SHALL mostrar "Imprimiendo recibo…" y el botón "Imprimir recibo" deshabilitado.
5. WHEN el Agente_Cajon responde `ok`, THE Pantalla_Resultado SHALL mostrar "Recibo impreso".
6. IF el Agente_Cajon no responde en 5 segundos o no está instalado, THEN THE Pantalla_Resultado SHALL mostrar "No se pudo imprimir: el agente de la impresora no responde. El turno sí quedó cerrado." y dejar habilitado "Imprimir recibo".
7. IF el Agente_Cajon responde con error, THEN THE Pantalla_Resultado SHALL mostrar "No se pudo imprimir: " seguido del error del agente y "El turno sí quedó cerrado.", y dejar habilitado "Imprimir recibo".
8. IF los Datos_Recibo no se pueden obtener, THEN THE Pantalla_Resultado SHALL mostrar "No se pudieron leer los datos del recibo. El turno sí quedó cerrado." y dejar habilitado "Imprimir recibo".
9. THE Sistema_Caja SHALL dejar el Turno cerrado y la Pantalla_Resultado con sus datos actuales sin importar el resultado de la impresión.
10. WHERE el cierre termina en `ya_cerrado` (otro dispositivo cerró primero), THE Sistema_Caja SHALL seguir el flujo actual sin imprimir.

### Requirement 6: Reimpresión desde Reportes (opcional)

**User Story:** Como dueña, quiero reimprimir el recibo de un turno pasado desde Reportes, para tener copia si se perdió.

#### Acceptance Criteria

1. WHERE la reimpresión desde Reportes está disponible, THE Sistema_Caja SHALL mostrar en Reportes > Turnos un botón "Imprimir recibo" de al menos 44 × 44 px en cada Turno cerrado.
2. WHERE la reimpresión desde Reportes está disponible, WHEN se toca "Imprimir recibo" de un Turno cerrado, THE Sistema_Caja SHALL imprimir su Recibo_Cierre con el mismo flujo del Requirement 5 y mostrar el resultado con un toast.

### Requirement 7: Compatibilidad

**User Story:** Como desarrollador, quiero que el recibo no rompa lo existente, para instalarlo sin riesgo.

#### Acceptance Criteria

1. THE Sistema_Caja SHALL usar solo clases Tailwind `lz-*`, textos en español y horas en formato de 12 horas con `hora12` o `fechaHora12`.
2. THE Sistema_Caja SHALL dejar sin cambios la página `/login`, `cerrar_turno`, `resumen_turno` y el cierre a ciegas.
3. THE Sistema_Caja SHALL llamar al Servidor solo con la anon key.
4. THE Migracion_Recibo SHALL poder ejecutarse más de una vez sin error y sin borrar ni modificar datos.
