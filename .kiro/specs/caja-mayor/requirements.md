# Requirements Document

## Introduction

Esta funcionalidad agrega la **Caja mayor** (el dinero de los dueños) a la Caja de Panadería Lizpan y cambia el cierre de turno a **cierre a ciegas**. Se construye sobre la spec `caja-ventas-reportes` (ya implementada) y sobre `supabase/migration-ventas.sql`.

Resumen del comportamiento aprobado:

- Quien cierra el turno solo escribe el efectivo contado, la base que deja para el siguiente turno y su nombre. No ve efectivo esperado, totales por método ni diferencia. El servidor sigue calculando y guardando esperado y diferencia; el administrador los ve en Reportes → Turnos.
- Al cerrar, el efectivo contado menos la base que se deja pasa a la parte Efectivo de la Caja mayor, y las ventas de cada método no efectivo pasan a su parte.
- El siguiente turno toma la base automáticamente.
- Durante el turno se pueden hacer retiros del cajón a la Caja mayor.
- Cada gasto indica de dónde sale el dinero: cajón, una parte de la Caja mayor o una combinación.
- En Reportes hay una pestaña "Caja mayor" con saldos, movimientos, ajustes manuales y gastos sin turno.

### Decisiones por defecto (registradas, aprobadas implícitamente)

1. **Modelo de partes:** tabla `caja_mayor_saldos` con una fila por Parte. La Parte Efectivo es una sola fila con `metodo_pago_id` nulo; todos los métodos con `es_efectivo` se juntan en ella. Cada método no efectivo tiene su propia Parte (`metodo_pago_id` único). Las Partes de métodos nuevos se crean solas cuando se necesitan.
2. **Retiro mayor al efectivo esperado del cajón:** se advierte y se pide confirmación, igual que con los gastos. La advertencia no muestra cifras para no romper el cierre a ciegas. La misma regla aplica a la advertencia de gastos con parte cajón.
3. **Retiros sin anulación:** un retiro registrado no se anula. Los errores se corrigen con un Ajuste manual en la Caja mayor.
4. **PIN:** las acciones de la pestaña Caja mayor quedan protegidas por el PIN de Reportes en la interfaz, igual que las demás secciones. Las RPC no piden PIN (mismo modelo que `reporte_rango`).
5. **Gastos sin turno:** cuentan en el total de gastos del Resumen y aparecen en la sección Gastos. Se pueden eliminar desde la pestaña Caja mayor en cualquier momento.
6. **Movimientos de $ 0:** no se registran (por ejemplo, un cierre sin ventas en Nequi no crea movimiento de Nequi).
7. **Firmas de RPC:** `abrir_turno`, `cerrar_turno` y `registrar_gasto` cambian de firma; las versiones anteriores se eliminan y el cliente se actualiza en la misma entrega.

## Glossary

- **Sistema_Caja**: la aplicación cliente Next 14 de la Caja (`/caja`) junto con las funciones RPC que usa.
- **Modulo_Reportes**: la sección de Reportes protegida por PIN (`/admin/reportes`).
- **Servidor**: las funciones SQL `SECURITY DEFINER` de Supabase que registran todos los movimientos de dinero.
- **Turno**: fila de `turnos`; abierto mientras `cerrado_en` es nulo.
- **Persona_Caja**: nombre en texto libre (1 a 60 caracteres) de quien hace una acción.
- **Base_Caja**: efectivo con que empieza un Turno.
- **Base_Siguiente**: efectivo que quien cierra deja en el cajón para el siguiente Turno; se guarda en el Turno cerrado.
- **Base_Caja_Defecto**: valor de `configuracion.base_caja_defecto` (pesos enteros; 0 si falta o no es válido).
- **Efectivo_Contado**: efectivo que quien cierra cuenta en el cajón.
- **Efectivo_Esperado**: Base_Caja + ventas registradas en efectivo − Parte_Cajon de gastos no eliminados − Retiros del Turno.
- **Enviado_Mayor**: Efectivo_Contado − Base_Siguiente; efectivo que pasa a la Caja_Mayor al cerrar.
- **Caja_Mayor**: dinero de los dueños, separado del cajón, con un saldo por Parte.
- **Parte**: fila de `caja_mayor_saldos`. Hay una Parte Efectivo y una Parte por cada método de pago no efectivo (Nequi, Transferencia, QR…).
- **Movimiento_Mayor**: fila inmutable de `caja_mayor_movimientos` de tipo `cierre_turno`, `retiro`, `gasto`, `eliminacion_gasto` o `ajuste`, con valor con signo y saldo después.
- **Retiro**: Movimiento_Mayor de tipo `retiro` que pasa efectivo del cajón del Turno abierto a la Parte Efectivo.
- **Origen_Gasto**: fila de `gasto_origenes` que indica cuánto de un gasto sale del cajón o de una Parte.
- **Parte_Cajon**: porción de un gasto que sale del cajón del Turno. Para gastos anteriores a esta migración (sin Origen_Gasto) es el valor completo.
- **Gasto_Sin_Turno**: gasto registrado desde el Modulo_Reportes, sin Turno, que sale solo de Partes.
- **Ajuste**: Movimiento_Mayor manual que suma o resta a una Parte con un motivo obligatorio.

## Requirements

### Requirement 1: Cierre a ciegas

**User Story:** Como dueño, quiero que quien cierra el turno no vea cuánto debería haber, para que cuente el efectivo sin acomodar la cifra.

#### Acceptance Criteria

1. WHILE el formulario de cierre está abierto, THE Sistema_Caja SHALL mostrar solo los campos Efectivo_Contado, Base_Siguiente y Persona_Caja, sin Efectivo_Esperado, totales por método, total de gastos ni vista previa de diferencia.
2. WHEN se abre el formulario de cierre, THE Sistema_Caja SHALL llenar Base_Siguiente con Base_Caja_Defecto y permitir editarla.
3. IF Base_Siguiente no es un entero entre 0 y Efectivo_Contado, THEN THE Sistema_Caja SHALL mostrar un mensaje junto al campo y no enviar el cierre.
4. WHEN quien cierra confirma un cierre válido, THE Servidor SHALL guardar en el Turno Efectivo_Contado, Efectivo_Esperado, diferencia (contado − esperado), Base_Siguiente y Enviado_Mayor.
5. WHEN el cierre termina, THE Servidor SHALL responder solo cerrado_por, cerrado_en, Base_Siguiente y Enviado_Mayor, sin Efectivo_Esperado ni diferencia.
6. WHEN el cierre termina, THE Sistema_Caja SHALL mostrar "Turno cerrado" con quién cerró, la hora en formato de 12 horas, la Base_Siguiente y el Enviado_Mayor, sin texto Cuadra, Sobrante ni Faltante.
7. IF otro dispositivo cerró el Turno primero, THEN THE Servidor SHALL responder `ya_cerrado` con cerrado_por y cerrado_en y no registrar Movimientos_Mayor.
8. WHEN se reintenta un cierre con la misma clave de idempotencia, THE Servidor SHALL devolver el resultado original sin crear Movimientos_Mayor nuevos.

### Requirement 2: Base automática al abrir turno

**User Story:** Como persona de caja, quiero que la base del nuevo turno sea la que dejó el turno anterior, para no tener que contarla y escribirla otra vez.

#### Acceptance Criteria

1. WHEN se abre un Turno, THE Servidor SHALL usar como Base_Caja la Base_Siguiente del último Turno cerrado (por cerrado_en).
2. IF el último Turno cerrado no tiene Base_Siguiente o no existe ningún Turno cerrado, THEN THE Servidor SHALL usar Base_Caja_Defecto como Base_Caja.
3. WHILE no hay Turno abierto, THE Sistema_Caja SHALL mostrar en la pantalla de apertura la base que se usará, solo para lectura, junto con el selector de Persona_Caja y el botón "Abrir turno".
4. THE Sistema_Caja SHALL abrir el Turno pidiendo solo Persona_Caja.

### Requirement 3: Partes y saldos de la Caja mayor

**User Story:** Como dueño, quiero ver cuánto dinero tengo en cada parte de la Caja mayor, para saber con qué cuento en efectivo, Nequi o transferencias.

#### Acceptance Criteria

1. THE Servidor SHALL mantener una Parte Efectivo única y una Parte por cada método de pago no efectivo que haya tenido movimientos o esté activo.
2. THE Servidor SHALL mantener el saldo de cada Parte como un entero mayor o igual a 0.
3. WHEN un movimiento cambia el saldo de una Parte, THE Servidor SHALL registrar un Movimiento_Mayor con tipo, Parte, valor con signo, saldo después, Persona_Caja, descripción, Turno o gasto relacionado y fecha del servidor.
4. IF un movimiento dejaría el saldo de una Parte por debajo de 0, THEN THE Servidor SHALL rechazar la operación completa con el código `SALDO_INSUFICIENTE` seguido del nombre de la Parte.
5. THE Servidor SHALL rechazar cualquier modificación o borrado de un Movimiento_Mayor ya registrado.
6. WHEN dos operaciones cambian la misma Parte al mismo tiempo, THE Servidor SHALL ejecutarlas en serie de forma que el saldo final sea la suma de ambas.

### Requirement 4: Entradas a la Caja mayor al cerrar

**User Story:** Como dueño, quiero que el dinero del turno pase solo a la Caja mayor al cerrar, para no tener que registrarlo a mano.

#### Acceptance Criteria

1. WHEN un Turno se cierra con Enviado_Mayor mayor que 0, THE Servidor SHALL sumar Enviado_Mayor a la Parte Efectivo con un Movimiento_Mayor `cierre_turno`.
2. WHEN un Turno se cierra, THE Servidor SHALL sumar a la Parte de cada método no efectivo el total de las ventas registradas del Turno con ese método, con un Movimiento_Mayor `cierre_turno` por Parte con total mayor que 0.
3. THE Servidor SHALL excluir las ventas anuladas de las entradas del cierre.
4. THE Servidor SHALL registrar el cierre del Turno y todos sus Movimientos_Mayor en una sola transacción.

### Requirement 5: Retiros a la Caja mayor durante el turno

**User Story:** Como persona de caja, quiero pasar efectivo del cajón a la Caja mayor durante el día, para no acumular mucho dinero en el cajón.

#### Acceptance Criteria

1. WHILE hay un Turno abierto, THE Sistema_Caja SHALL mostrar un botón "Retiro a caja mayor" que abre un diálogo con valor, Persona_Caja y nota opcional.
2. IF el valor del Retiro no es un entero entre 1 y 10.000.000 o la nota supera 120 caracteres, THEN THE Sistema_Caja SHALL mostrar un mensaje junto al campo y no enviar el Retiro.
3. IF el valor del Retiro supera el Efectivo_Esperado del Turno, THEN THE Sistema_Caja SHALL pedir confirmación con un aviso que no muestra cifras antes de enviar.
4. WHEN se confirma un Retiro válido, THE Servidor SHALL sumar el valor a la Parte Efectivo con un Movimiento_Mayor `retiro` ligado al Turno.
5. THE Servidor SHALL restar los Retiros del Turno en el Efectivo_Esperado.
6. IF el Turno está cerrado al registrar un Retiro, THEN THE Servidor SHALL rechazarlo con `TURNO_CERRADO`.
7. WHEN se reintenta un Retiro con la misma clave de idempotencia, THE Servidor SHALL devolver el Retiro original sin crear otro.
8. THE Servidor SHALL excluir los Retiros de los totales de gastos.

### Requirement 6: Origen de los gastos

**User Story:** Como persona de caja, quiero indicar de dónde sale el dinero de un gasto, para que el cajón y la Caja mayor queden correctos.

#### Acceptance Criteria

1. WHEN se registra un gasto con Turno, THE Sistema_Caja SHALL permitir escoger como origen Cajón, Caja mayor Efectivo, cada Parte no efectivo o Combinado, con Cajón seleccionado al inicio.
2. WHILE el origen escogido incluye Partes, THE Sistema_Caja SHALL mostrar el saldo disponible de cada Parte.
3. WHERE el origen es Combinado, THE Sistema_Caja SHALL pedir un valor por fuente y enviar el gasto solo cuando la suma de valores sea igual al valor del gasto.
4. IF los orígenes enviados no suman el valor del gasto, repiten una fuente, tienen un valor menor que 1 o nombran una Parte inexistente, THEN THE Servidor SHALL rechazar el gasto con `ORIGEN_INVALIDO`.
5. WHEN se registra un gasto válido, THE Servidor SHALL guardar un Origen_Gasto por fuente y restar de cada Parte su valor con un Movimiento_Mayor `gasto`.
6. THE Servidor SHALL restar del Efectivo_Esperado del Turno solo la Parte_Cajon de cada gasto no eliminado.
7. IF el valor de la Parte_Cajon supera el Efectivo_Esperado del Turno, THEN THE Sistema_Caja SHALL pedir confirmación con un aviso que no muestra cifras.
8. IF una Parte no alcanza para su valor, THEN THE Servidor SHALL rechazar el gasto completo con `SALDO_INSUFICIENTE` y THE Sistema_Caja SHALL mostrar qué Parte no alcanza y recargar los saldos.
9. WHEN el panel de gastos lista los gastos del Turno, THE Sistema_Caja SHALL mostrar el origen de cada gasto.

### Requirement 7: Eliminación de gastos

**User Story:** Como persona de caja, quiero que eliminar un gasto devuelva el dinero a donde salió, para que los saldos no queden descuadrados.

#### Acceptance Criteria

1. WHEN se elimina un gasto, THE Servidor SHALL devolver a cada Parte de sus Origen_Gasto el valor correspondiente con un Movimiento_Mayor `eliminacion_gasto`.
2. WHEN se elimina un gasto ya eliminado, THE Servidor SHALL terminar sin cambios.
3. IF el gasto tiene Turno y el Turno está cerrado, THEN THE Servidor SHALL rechazar la eliminación con `TURNO_CERRADO`.
4. WHERE el gasto es un Gasto_Sin_Turno, THE Servidor SHALL permitir eliminarlo en cualquier momento.

### Requirement 8: Pestaña Caja mayor en Reportes

**User Story:** Como dueño, quiero una sección de Caja mayor en Reportes, para ver saldos y movimientos, corregir saldos y registrar pagos grandes.

#### Acceptance Criteria

1. THE Modulo_Reportes SHALL mostrar una pestaña "Caja mayor" protegida por el mismo PIN que las demás secciones.
2. WHEN se abre la pestaña Caja mayor, THE Modulo_Reportes SHALL mostrar el saldo de cada Parte y el total.
3. WHEN se aplica un rango de fechas, THE Modulo_Reportes SHALL listar los Movimientos_Mayor del rango, más reciente primero, con fecha y hora en formato de 12 horas, tipo, Parte, valor con signo, saldo después, Persona_Caja y descripción.
4. WHEN se registra un Ajuste con Parte, valor con signo distinto de 0 y motivo de 3 a 200 caracteres, THE Servidor SHALL aplicarlo a la Parte con un Movimiento_Mayor `ajuste`.
5. IF el Ajuste no tiene motivo válido o su valor es 0, THEN THE Modulo_Reportes SHALL mostrar un mensaje junto al campo y no enviarlo.
6. WHEN se registra un Gasto_Sin_Turno, THE Modulo_Reportes SHALL pedir valor, concepto, categoría, Persona_Caja y orígenes entre las Partes (una o combinadas), sin opción Cajón.
7. IF un Gasto_Sin_Turno incluye el Cajón como origen, THEN THE Servidor SHALL rechazarlo con `ORIGEN_INVALIDO`.
8. WHEN un Ajuste o Gasto_Sin_Turno termina, THE Modulo_Reportes SHALL recargar saldos y movimientos.
9. WHEN se reintenta un Ajuste con la misma clave de idempotencia, THE Servidor SHALL devolver el Ajuste original sin aplicarlo otra vez.

### Requirement 9: Reportes de Turnos y Gastos

**User Story:** Como dueño, quiero ver retiros, base dejada y lo enviado a la Caja mayor en cada turno, y el origen de cada gasto, para revisar el cuadre completo.

#### Acceptance Criteria

1. THE Modulo_Reportes SHALL mostrar en cada fila de Turnos el total de Retiros, la Base_Siguiente y el Enviado_Mayor, además de las columnas actuales (esperado, contado y diferencia incluidos).
2. THE Modulo_Reportes SHALL mostrar en cada gasto de la sección Gastos su origen como texto ("Cajón", nombre de una Parte o la lista de fuentes con valores).
3. THE Modulo_Reportes SHALL producir las mismas columnas en pantalla, CSV y PDF para Turnos y Gastos.
4. THE Modulo_Reportes SHALL mostrar vacías Base_Siguiente y Enviado_Mayor para Turnos abiertos y para Turnos cerrados antes de esta migración.

### Requirement 10: Fórmula del efectivo esperado

**User Story:** Como dueño, quiero una sola fórmula de efectivo esperado en servidor y cliente, para que los reportes y las advertencias coincidan.

#### Acceptance Criteria

1. THE Servidor SHALL calcular Efectivo_Esperado como Base_Caja + ventas registradas en efectivo − Parte_Cajon de gastos no eliminados − Retiros del Turno en `efectivo_esperado_turno`, `resumen_turno`, `cerrar_turno` y `reporte_rango`.
2. THE Sistema_Caja SHALL calcular Efectivo_Esperado en `src/lib/caja/turno.ts` con la misma fórmula.

### Requirement 11: Migración y compatibilidad

**User Story:** Como desarrollador, quiero una migración idempotente que respete los datos existentes, para instalarla sin perder información.

#### Acceptance Criteria

1. THE Servidor SHALL definir los cambios en `supabase/migration-caja-mayor.sql`, ejecutable después de `migration-ventas.sql` y más de una vez sin error.
2. THE Servidor SHALL tratar los gastos existentes sin Origen_Gasto como 100 % Parte_Cajon.
3. THE Servidor SHALL dejar válidos los Turnos cerrados existentes con Base_Siguiente y Enviado_Mayor nulos.
4. THE Servidor SHALL dejar las tablas nuevas con RLS de solo lectura para la llave anon y las escrituras solo por RPC.
5. THE Sistema_Caja SHALL reconocer los códigos de error `SALDO_INSUFICIENTE` y `ORIGEN_INVALIDO` en `src/lib/api/errores.ts`.
