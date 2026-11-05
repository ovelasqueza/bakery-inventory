/**
 * Agente del cajón (herramientas/cajon): programa pequeño que corre en el equipo con la
 * impresora térmica, escucha solo en 127.0.0.1 y manda la orden de abrir el cajón o de
 * imprimir el recibo de cierre.
 */
const AGENTE_CAJON = 'http://127.0.0.1:17777';

/** Tiempo máximo de espera de `POST /imprimir` (Req 5.6). */
const TIMEOUT_IMPRIMIR_MS = 5000;

/** Tamaño de bloque para `String.fromCharCode` (evita el límite de argumentos). */
const BLOQUE_BASE64 = 8192;

/** Resultado de mandar un recibo al agente. */
export type ResultadoImpresion =
  | { ok: true }
  | { ok: false; motivo: 'sin_agente' }
  | { ok: false; motivo: 'error'; mensaje: string };

/**
 * Abre el cajón con el agente. Devuelve false si el agente no está instalado,
 * no respondió a tiempo o no pudo abrir.
 */
export async function abrirCajonSinPapel(): Promise<boolean> {
  try {
    // POST sin cuerpo ni encabezados: petición simple, sin preflight
    const r = await fetch(`${AGENTE_CAJON}/abrir`, { method: 'POST', signal: AbortSignal.timeout(1500) });
    if (!r.ok) return false;
    const d = (await r.json()) as { ok?: boolean };
    return d.ok === true;
  } catch {
    return false;
  }
}

/** Codifica los bytes en base64 con `btoa`, por bloques de 8 KB. Pura. */
export function aBase64(bytes: Uint8Array): string {
  let binario = '';
  for (let i = 0; i < bytes.length; i += BLOQUE_BASE64) {
    const bloque = bytes.subarray(i, i + BLOQUE_BASE64);
    binario += String.fromCharCode.apply(null, Array.from(bloque));
  }
  return btoa(binario);
}

/**
 * Manda los bytes ESC/POS al agente con `POST /imprimir`. El cuerpo es un string base64:
 * `fetch` lo envía como `text/plain;charset=UTF-8`, así que es una petición simple sin
 * preflight, como `/abrir`. Timeout de 5 s.
 * - Excepción, timeout o agente no instalado → `sin_agente`.
 * - Respuesta JSON con `ok: false` → `error` con el `error` del agente.
 * - Respuesta que no es JSON → `error` con el estado HTTP.
 */
export async function imprimirEnAgente(bytes: Uint8Array): Promise<ResultadoImpresion> {
  let r: Response;
  try {
    r = await fetch(`${AGENTE_CAJON}/imprimir`, {
      method: 'POST',
      body: aBase64(bytes),
      signal: AbortSignal.timeout(TIMEOUT_IMPRIMIR_MS),
    });
  } catch {
    return { ok: false, motivo: 'sin_agente' };
  }

  let d: { ok?: unknown; error?: unknown };
  try {
    d = (await r.json()) as { ok?: unknown; error?: unknown };
  } catch {
    return { ok: false, motivo: 'error', mensaje: `error HTTP ${r.status}` };
  }

  if (r.ok && d?.ok === true) return { ok: true };
  const mensaje = typeof d?.error === 'string' && d.error.trim() !== '' ? d.error : `error HTTP ${r.status}`;
  return { ok: false, motivo: 'error', mensaje };
}
