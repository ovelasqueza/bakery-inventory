/**
 * Agente del cajón (herramientas/cajon): programa pequeño que corre en el equipo con la
 * impresora térmica, escucha solo en 127.0.0.1 y manda la orden de abrir el cajón sin imprimir.
 */
const AGENTE_CAJON = 'http://127.0.0.1:17777';

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
