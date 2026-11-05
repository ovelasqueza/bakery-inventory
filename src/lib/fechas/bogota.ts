// Utilidades de fecha para la zona America/Bogota.
// Colombia no tiene horario de verano: se usa un desplazamiento fijo de −5 h.

export const ZONA = 'America/Bogota';

const OFFSET_MS = -5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_DIAS_RANGO = 366;

export type Rango = { desde: string; hasta: string };

export type AtajoRango = 'hoy' | 'ayer' | 'ultimos7' | 'esteMes' | 'mesAnterior';

export type ErrorRango = 'FALTA_FECHA' | 'INICIO_POSTERIOR' | 'MAS_DE_366';

function dos(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Devuelve un Date cuyos campos UTC representan la hora local de Bogotá. */
function aLocal(isoUtc: string | Date): Date {
  const d = typeof isoUtc === 'string' ? new Date(isoUtc) : isoUtc;
  return new Date(d.getTime() + OFFSET_MS);
}

function formatearDia(local: Date): string {
  return `${local.getUTCFullYear()}-${dos(local.getUTCMonth() + 1)}-${dos(local.getUTCDate())}`;
}

/** 'AAAA-MM-DD' en hora de Bogotá (fecha UTC − 5 h). */
export function diaLocal(isoUtc: string | Date): string {
  return formatearDia(aLocal(isoUtc));
}

/** 'HH:mm' en formato 24 h, hora de Bogotá. */
export function horaLocal(isoUtc: string | Date): string {
  const l = aLocal(isoUtc);
  return `${dos(l.getUTCHours())}:${dos(l.getUTCMinutes())}`;
}

/** 'h:mm am' / 'h:mm pm' en formato de 12 horas, hora de Bogotá (para mostrar en pantalla). */
export function hora12(isoUtc: string | Date): string {
  const l = aLocal(isoUtc);
  const h = l.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${dos(l.getUTCMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}

/** 'AAAA-MM-DD h:mm pm' en hora de Bogotá (para mostrar en pantalla y PDF). */
export function fechaHora12(isoUtc: string | Date): string {
  return `${diaLocal(isoUtc)} ${hora12(isoUtc)}`;
}

/** 'AAAA-MM-DD HH:mm' en hora de Bogotá (CSV). */
export function fechaHoraLocal(isoUtc: string | Date): string {
  return `${diaLocal(isoUtc)} ${horaLocal(isoUtc)}`;
}

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Convierte 'AAAA-MM-DD' a milisegundos UTC de medianoche; null si no es una fecha válida. */
function diaAMs(dia: string): number | null {
  const m = RE_DIA.exec(dia);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const f = new Date(ms);
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mo - 1 || f.getUTCDate() !== d) return null;
  return ms;
}

function sumarDias(dia: string, n: number): string {
  const ms = diaAMs(dia);
  if (ms === null) throw new Error(`Fecha inválida: ${dia}`);
  return formatearDia(new Date(ms + n * DIA_MS));
}

/** Rango de días locales para un atajo, relativo a `ahora` (por defecto, el instante actual). */
export function atajoRango(nombre: AtajoRango, ahora: Date = new Date()): Rango {
  const hoy = diaLocal(ahora);
  const local = aLocal(ahora);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  switch (nombre) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case 'ayer': {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case 'ultimos7':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case 'esteMes':
      return { desde: formatearDia(new Date(Date.UTC(y, m, 1))), hasta: hoy };
    case 'mesAnterior': {
      const desde = formatearDia(new Date(Date.UTC(y, m - 1, 1)));
      const hasta = formatearDia(new Date(Date.UTC(y, m, 0)));
      return { desde, hasta };
    }
  }
}

/**
 * Valida un rango de días locales 'AAAA-MM-DD'.
 * Falta o fecha inválida → FALTA_FECHA; desde > hasta → INICIO_POSTERIOR;
 * más de 366 días inclusivos → MAS_DE_366.
 */
export function validarRango(
  desde: string | null,
  hasta: string | null,
): { ok: true; rango: Rango } | { ok: false; error: ErrorRango } {
  const d = desde?.trim() ?? '';
  const h = hasta?.trim() ?? '';
  const msD = d ? diaAMs(d) : null;
  const msH = h ? diaAMs(h) : null;
  if (msD === null || msH === null) return { ok: false, error: 'FALTA_FECHA' };
  if (msD > msH) return { ok: false, error: 'INICIO_POSTERIOR' };
  const dias = Math.round((msH - msD) / DIA_MS) + 1;
  if (dias > MAX_DIAS_RANGO) return { ok: false, error: 'MAS_DE_366' };
  return { ok: true, rango: { desde: d, hasta: h } };
}

/** Límites UTC semiabiertos [desde 00:00 −05:00, hasta+1 00:00 −05:00) en ISO. */
export function limitesUtc(r: Rango): { inicio: string; fin: string } {
  const msD = diaAMs(r.desde);
  const msH = diaAMs(r.hasta);
  if (msD === null || msH === null) throw new Error('Rango inválido');
  return {
    inicio: new Date(msD - OFFSET_MS).toISOString(),
    fin: new Date(msH + DIA_MS - OFFSET_MS).toISOString(),
  };
}
