import { llamarRpc } from '@/lib/api/errores';

/** Turno abierto tal como lo devuelven las funciones SQL. */
export interface TurnoAbierto {
  id: string;
  abiertoPor: string;
  abiertoEn: string;
  base: number;
}

export interface ResultadoApertura {
  /** 'existente': ya había otro turno abierto y se devuelve ese (Req 2.10). */
  resultado: 'abierto' | 'existente';
  turno: TurnoAbierto;
}

export interface TotalPorMetodo {
  metodoPagoId: string;
  nombre: string;
  esEfectivo: boolean;
  total: number;
  cantidad: number;
}

export interface ResumenTurno {
  turno: TurnoAbierto;
  base: number;
  porMetodo: TotalPorMetodo[];
  totalVentas: number;
  totalGastos: number;
  /** Suma de los retiros a caja mayor del turno. */
  totalRetiros: number;
  efectivoEsperado: number;
}

/** Respuesta del cierre a ciegas: sin esperado ni diferencia (Req 1.6, 1.7). */
export interface Cierre {
  cerradoEn: string;
  cerradoPor: string;
  /** Efectivo que queda en el cajón como base del siguiente turno. */
  baseSiguiente: number;
  /** contado − baseSiguiente, enviado a la Parte Efectivo de la caja mayor. */
  enviadoMayor: number;
}

export type ResultadoCierre =
  | { resultado: 'cerrado'; cierre: Cierre }
  /** Otro dispositivo cerró el turno primero (Req 3.8). */
  | { resultado: 'ya_cerrado'; cerradoPor: string; cerradoEn: string };

// ---- Formas crudas (snake_case) devueltas por las RPC ----

interface TurnoCrudo {
  id: string;
  abierto_por: string;
  abierto_en: string;
  base: number;
}

interface ResumenCrudo {
  turno: TurnoCrudo;
  base: number;
  por_metodo: {
    metodo_pago_id: string;
    nombre: string;
    es_efectivo: boolean;
    total: number;
    cantidad: number;
  }[];
  total_ventas: number;
  total_gastos: number;
  total_retiros: number | null;
  efectivo_esperado: number;
}

type CierreCrudo =
  | {
      resultado: 'cerrado';
      cierre: {
        cerrado_en: string;
        cerrado_por: string;
        base_siguiente: number;
        enviado_mayor: number;
      };
    }
  | { resultado: 'ya_cerrado'; cerrado_por: string; cerrado_en: string };

function aTurno(t: TurnoCrudo): TurnoAbierto {
  return {
    id: t.id,
    abiertoPor: t.abierto_por,
    abiertoEn: t.abierto_en,
    base: Number(t.base),
  };
}

/** Turno abierto actual, o `null` si no hay ninguno. */
export async function obtenerTurnoAbierto(): Promise<TurnoAbierto | null> {
  const data = await llamarRpc<TurnoCrudo | null>('turno_abierto', {});
  return data ? aTurno(data) : null;
}

/**
 * Base con la que abrirá el próximo turno: la que dejó el último cierre o la de
 * configuración (Req 2.1, 2.2). Solo se muestra; el servidor la vuelve a calcular.
 */
export async function baseProximoTurno(): Promise<number> {
  const data = await llamarRpc<number | null>('base_proximo_turno', {});
  return Number(data ?? 0);
}

/**
 * Abre un turno; el servidor fija la base con `base_proximo_turno()` (Req 2.1).
 * `clave` es un UUID del cliente; reintentar con la misma clave no crea otro turno.
 */
export async function abrirTurno(clave: string, persona: string): Promise<ResultadoApertura> {
  const data = await llamarRpc<{ resultado: 'abierto' | 'existente'; turno: TurnoCrudo }>('abrir_turno', {
    p_clave: clave,
    p_persona: persona,
  });
  return { resultado: data.resultado, turno: aTurno(data.turno) };
}

/** Totales del turno sin ventas anuladas ni gastos eliminados (Req 3.2). */
export async function resumenTurno(turnoId: string): Promise<ResumenTurno> {
  const data = await llamarRpc<ResumenCrudo>('resumen_turno', { p_turno: turnoId });
  return {
    turno: aTurno(data.turno),
    base: Number(data.base),
    porMetodo: (data.por_metodo ?? []).map((m) => ({
      metodoPagoId: m.metodo_pago_id,
      nombre: m.nombre,
      esEfectivo: m.es_efectivo,
      total: Number(m.total),
      cantidad: Number(m.cantidad),
    })),
    totalVentas: Number(data.total_ventas),
    totalGastos: Number(data.total_gastos),
    totalRetiros: Number(data.total_retiros ?? 0),
    efectivoEsperado: Number(data.efectivo_esperado),
  };
}

/**
 * Cierre a ciegas con el efectivo contado y la base que queda para el siguiente
 * turno (Req 1.4, 1.5). El resto (contado − base) pasa a la caja mayor.
 * El primer cierre gana: si otro dispositivo cerró antes, devuelve `ya_cerrado`.
 */
export async function cerrarTurno(
  turnoId: string,
  clave: string,
  persona: string,
  contado: number,
  baseSiguiente: number,
): Promise<ResultadoCierre> {
  const data = await llamarRpc<CierreCrudo>('cerrar_turno', {
    p_turno: turnoId,
    p_clave: clave,
    p_persona: persona,
    p_contado: contado,
    p_base_siguiente: baseSiguiente,
  });
  if (data.resultado === 'ya_cerrado') {
    return { resultado: 'ya_cerrado', cerradoPor: data.cerrado_por, cerradoEn: data.cerrado_en };
  }
  const c = data.cierre;
  return {
    resultado: 'cerrado',
    cierre: {
      cerradoEn: c.cerrado_en,
      cerradoPor: c.cerrado_por,
      baseSiguiente: Number(c.base_siguiente),
      enviadoMayor: Number(c.enviado_mayor),
    },
  };
}
