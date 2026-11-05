# Cajón monedero

El agente del cajón es un programa pequeño que se instala **en el computador que tiene la impresora térmica y el cajón conectados**. Cuando se toca **Abrir cajón** en la app, el agente le manda a la impresora la orden de abrir el cajón, sin imprimir nada. También imprime el recibo del cierre de turno.

Es el mismo agente del POS (`pos-management-platform`). Si ese equipo ya lo tiene instalado por el POS, basta con ejecutar el `instalar.cmd` de esta carpeta: el instalador conserva las direcciones del POS y suma las de esta app.

## Instalar (una vez por equipo)

1. Copia la carpeta `herramientas/cajon` a ese computador. Puede ser con una USB o descargándola de GitHub.
2. Haz **doble clic en `instalar.cmd`**. No necesita permisos de administrador.
3. Escribe el **número de la impresora** que tiene el cajón conectado. Es la térmica; si hay varias, la que dice "(predeterminada)".
4. Cuando pregunte "¿Probar abrir el cajón ahora?", escribe **S**. El cajón debe abrir.
   - Si no abre, cierra la ventana y ejecuta en esa carpeta: `instalar.cmd -Pin 5`
5. Abre la app y toca **Abrir cajón**. Si Chrome pregunta si la página puede **acceder a dispositivos de tu red local**, elige **Permitir**.

Desde ese momento el agente arranca solo cada vez que se inicia sesión en Windows.

## Imprimir el recibo de cierre

El mismo agente imprime el recibo del cierre de turno en la impresora térmica que se eligió al instalar. No hay que instalar nada más.

- Al cerrar el turno, el recibo sale solo una vez.
- Para sacar otra copia, toca **Imprimir recibo** en la pantalla del cierre.
- Si la app dice "No se pudo imprimir", el turno sí quedó cerrado. Revisa que la impresora esté prendida y con papel, y toca **Imprimir recibo** otra vez.
- Si dice que "el agente de la impresora no responde", el agente no está instalado o es una versión anterior que no sabe imprimir. Actualízalo como se explica abajo.

## Actualizar el agente

Para pasar a una versión nueva del agente, por ejemplo la que imprime el recibo de cierre:

1. Copia la carpeta `herramientas/cajon` nueva a ese computador, encima de la anterior.
2. Haz **doble clic en `instalar.cmd`**. El instalador detiene el agente que está corriendo, copia el nuevo y lo vuelve a arrancar.
3. Elige otra vez la impresora. El instalador siempre la pregunta.
   - Si el cajón necesitó `-Pin 5`, instala otra vez con `instalar.cmd -Pin 5`. Si no, el pin vuelve a ser el 2.

Las direcciones permitidas se conservan, incluidas las del POS y las que se agregaron con `-Origenes`. La versión nueva es compatible con el POS que comparte el agente: abrir el cajón funciona igual.

## Direcciones de la app

El agente solo obedece a estas direcciones:

- `https://inventario-lizpan.vercel.app`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Si la app se abre desde otra dirección, por ejemplo un dominio propio, instala así:

```
instalar.cmd -Origenes https://mi-dominio.com
```

## Cambiar la impresora o desinstalar

- Para cambiar la impresora, ejecuta `instalar.cmd` otra vez y elige la nueva.
- Para desinstalar, usa `desinstalar.cmd`. Se quita el agente del equipo, también para el POS si lo usaba.

## Si no funciona

- Si la app muestra "No se pudo abrir el cajón", el agente no está instalado, no está corriendo o no permite esa dirección.
- Revisa el registro del agente en `%LOCALAPPDATA%\POS-Cajon\agente.log`. Para abrirlo, pega esa ruta en la barra del Explorador de archivos.
  - Si aparece "Rechazado … origen='…'", la dirección no está permitida. Instala con `-Origenes`, como se explica arriba.
- Si Chrome bloqueó el permiso de red local, permítelo desde el candado de la barra de direcciones.

## Seguridad

- El agente solo escucha dentro del mismo equipo (`127.0.0.1`, puerto 17777). No se puede usar desde otros equipos de la red.
- Solo responde a las direcciones permitidas.
- Lo único que puede hacer es abrir el cajón e imprimir lo que mande la app desde una dirección permitida.
- En el registro anota la impresora, el tamaño y la dirección de cada recibo, nunca su contenido.

## Para desarrolladores (cuando se haga el POS de esta panadería)

Esta información es para quien lleve el botón a otro proyecto, sea una persona o un asistente de código.

1. **Copiar** la carpeta `herramientas/cajon` tal cual. En `instalar.ps1`, ajustar la lista `$Origenes` a las direcciones donde se abre la nueva app.
2. **Llamar al agente** desde el navegador (código del cliente). En este proyecto está en `src/lib/cajon.ts`:
   ```ts
   const r = await fetch("http://127.0.0.1:17777/abrir", { method: "POST", signal: AbortSignal.timeout(1500) });
   const abrio = r.ok && (await r.json()).ok === true;
   ```
   - Debe ser un `POST` **sin cuerpo y sin encabezados**. Así es una petición simple y no hay preflight.
   - Si falla (sin agente, sin respuesta o error), el `fetch` lanza o `ok` es `false`.
   - `GET /estado` responde `{ ok, impresora }` y sirve para saber si el agente está corriendo.
3. **Plan B** cuando el agente no responde:
   - Esta app no imprime: muestra un aviso.
   - En el POS (`pos-management-platform`): se imprime con `window.print()` una página casi vacía (1 mm, sin texto). El driver de la impresora está configurado para abrir el cajón al empezar a imprimir, así que el cajón abre gastando unos 1 cm de papel. Requiere la impresión directa de Chrome (`--kiosk-printing` en el acceso directo de la PWA).
4. **Evitar doble clic**: no llamar de nuevo mientras una llamada está en curso. En este proyecto el botón está en `src/components/ui/BotonCajon.tsx`.
5. **Imprimir** con `POST /imprimir`. El cuerpo es el texto base64 de los bytes ESC/POS ya armados. En este proyecto está en `src/lib/cajon.ts` (`imprimirEnAgente`):
   ```ts
   const r = await fetch("http://127.0.0.1:17777/imprimir", { method: "POST", body: base64, signal: AbortSignal.timeout(5000) });
   const d = await r.json(); // { ok: true } o { ok: false, error }
   ```
   - Con un `body` de tipo string, el navegador manda `Content-Type: text/plain;charset=UTF-8`. Sigue siendo una petición simple, sin preflight.
   - El agente lee el cuerpo según `Content-Length`. Todo el cuerpo debe llegar en 2 segundos.
   - El agente decodifica el base64 y manda los bytes tal cual, en modo RAW, en un trabajo llamado "Recibo cierre". El corte de papel y los avances van dentro de los bytes.
   - Respuestas:
     - `200` `{ "ok": true }`.
     - `411` `{ "ok": false, "error": "Falta Content-Length" }`.
     - `413` `{ "ok": false, "error": "Recibo muy grande" }`, si el cuerpo pasa de 65.536 bytes. No se lee el cuerpo.
     - `400` `{ "ok": false, "error": "Recibo inválido" }`, si el base64 no es válido, está vacío o llega incompleto. No imprime.
     - `500` `{ "ok": false, "error": <motivo> }`, si no hay impresora o falla. El motivo también queda en `agente.log`.
     - `403` si la dirección o el `Host` no están permitidos, igual que en las demás rutas.

El agente manda `ESC p 0 25 250` (`1B 70 00 19 FA`) por la cola de Windows en modo RAW. Con `-Pin 5` manda `1B 70 01 19 FA`.
