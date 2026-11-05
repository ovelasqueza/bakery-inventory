// Lógica pura del PIN_Admin de Reportes (Req 15). No lee ni escribe almacenamiento:
// quien la usa guarda EstadoIntentos en localStorage y la marca de verificación en sessionStorage.

export const PIN = {
  intentos: 5,
  bloqueoMs: 5 * 60_000,
  duracionMs: 8 * 3_600_000,
} as const;

export type EstadoIntentos = { fallidos: number; bloqueadoHasta: number | null };

const ESTADO_INICIAL: EstadoIntentos = { fallidos: 0, bloqueadoHasta: null };

/** Registra un PIN incorrecto. Al llegar al 5.º fallo seguido bloquea por 5 minutos desde `ahora` (Req 15.3, 15.7). */
export function registrarFallo(e: EstadoIntentos, ahora: number): EstadoIntentos {
  const { bloqueado, estado } = estaBloqueado(e, ahora);
  // Durante el bloqueo no se aceptan intentos, así que no cuentan.
  if (bloqueado) return estado;

  const previos = Number.isFinite(estado.fallidos) && estado.fallidos > 0 ? Math.floor(estado.fallidos) : 0;
  const fallidos = Math.min(previos + 1, PIN.intentos);
  return {
    fallidos,
    bloqueadoHasta: fallidos >= PIN.intentos ? ahora + PIN.bloqueoMs : null,
  };
}

/** PIN correcto: el conteo vuelve a 0 (Req 15.2). */
export function registrarExito(): EstadoIntentos {
  return { ...ESTADO_INICIAL };
}

/** Indica si hay bloqueo vigente. Si el bloqueo ya venció, devuelve el estado reiniciado a 0 (Req 15.3). */
export function estaBloqueado(
  e: EstadoIntentos,
  ahora: number,
): { bloqueado: boolean; restanteMs: number; estado: EstadoIntentos } {
  if (e.bloqueadoHasta === null) {
    return { bloqueado: false, restanteMs: 0, estado: e };
  }
  if (ahora < e.bloqueadoHasta) {
    return { bloqueado: true, restanteMs: e.bloqueadoHasta - ahora, estado: e };
  }
  return { bloqueado: false, restanteMs: 0, estado: { ...ESTADO_INICIAL } };
}

/** El acceso dura 8 horas desde la verificación (Req 15.2). Una marca futura o inválida no da acceso. */
export function accesoVigente(verificadoEn: number | null, ahora: number): boolean {
  if (verificadoEn === null || !Number.isFinite(verificadoEn)) return false;
  const transcurrido = ahora - verificadoEn;
  return transcurrido >= 0 && transcurrido < PIN.duracionMs;
}

/** Un PIN nuevo tiene solo dígitos 0–9, de 4 a 8 (Req 15.4, 15.9). */
export function validarPinNuevo(s: string): boolean {
  return /^\d{4,8}$/.test(s);
}
