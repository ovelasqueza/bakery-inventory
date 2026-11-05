import type { Rango } from '@/lib/fechas/bogota';
import { llamarRpc } from './errores';

/** Una Parte de la caja mayor: Efectivo (`metodoPagoId = null`) o un método no efectivo. */
export interface ParteCajaMayor {
  parteId: string;
  metodoPagoId: string | null;
  nombre: string;
  activo: boolean;
  saldo: number;
}

export type TipoMovimientoMayor = 'cierre_turno' | 'retiro' | 'gasto' | 'eliminacion_gasto' | 'ajuste';

/** Movimiento de la caja mayor; `valor` positivo entra y negativo sale. */
export interface MovimientoMayor {
  id: string;
  creadoEn: string;
  tipo: TipoMovimientoMayor;
  parteId: string;
  parteNombre: string;
  valor: number;
  saldoDespues: number;
  persona: string | null;
  descripcion: string | null;
  turnoId: string | null;
  gastoId: string | null;
  gastoEliminado: boolean;
}

export interface EntradaRetiro {
  /** Clave de idempotencia (UUID); se reutiliza en reintentos. */
  clave: string;
  turnoId: string;
  valor: number;
  persona: string;
  nota: string | null;
}

export interface EntradaAjuste {
  /** Clave de idempotencia (UUID); se reutiliza en reintentos. */
  clave: string;
  parteId: string;
  /** Distinto de 0: positivo suma y negativo quita. */
  valor: number;
  motivo: string;
  persona: string;
}

// ---- Formas crudas (snake_case) ----

interface ParteCruda {
  parte_id: string;
  metodo_pago_id: string | null;
  nombre: string;
  activo: boolean | null;
  saldo: number | string;
}

/**
 * `movimientos_caja_mayor` devuelve todos los campos; `registrar_retiro` y
 * `ajustar_caja_mayor` pueden devolver solo una parte, por eso son opcionales.
 */
interface MovimientoCrudo {
  id: string;
  creado_en: string;
  tipo?: TipoMovimientoMayor;
  parte_id?: string;
  parte_nombre?: string;
  valor: number | string;
  saldo_despues?: number | string;
  persona?: string | null;
  descripcion?: string | null;
  turno_id?: string | null;
  gasto_id?: string | null;
  gasto_eliminado?: boolean | null;
}

function aParte(p: ParteCruda): ParteCajaMayor {
  return {
    parteId: p.parte_id,
    metodoPagoId: p.metodo_pago_id ?? null,
    nombre: p.nombre,
    activo: p.activo ?? true,
    saldo: Number(p.saldo),
  };
}

function aMovimiento(m: MovimientoCrudo, porDefecto: Partial<MovimientoMayor> = {}): MovimientoMayor {
  return {
    id: m.id,
    creadoEn: m.creado_en,
    tipo: m.tipo ?? porDefecto.tipo ?? 'ajuste',
    parteId: m.parte_id ?? porDefecto.parteId ?? '',
    parteNombre: m.parte_nombre ?? porDefecto.parteNombre ?? '',
    valor: Number(m.valor),
    saldoDespues: Number(m.saldo_despues ?? porDefecto.saldoDespues ?? 0),
    persona: m.persona ?? porDefecto.persona ?? null,
    descripcion: m.descripcion ?? porDefecto.descripcion ?? null,
    turnoId: m.turno_id ?? porDefecto.turnoId ?? null,
    gastoId: m.gasto_id ?? porDefecto.gastoId ?? null,
    gastoEliminado: m.gasto_eliminado ?? false,
  };
}

/** Saldo de cada Parte: Efectivo primero y luego por el orden de los métodos. */
export async function obtenerSaldos(): Promise<ParteCajaMayor[]> {
  const data = await llamarRpc<ParteCruda[] | null>('saldos_caja_mayor', {});
  return (data ?? []).map(aParte);
}

/**
 * Movimientos del rango de fechas locales [desde, hasta], más reciente primero.
 * Rangos inválidos llegan como `RANGO_INVALIDO`.
 */
export async function obtenerMovimientos(rango: Rango): Promise<MovimientoMayor[]> {
  const data = await llamarRpc<MovimientoCrudo[] | null>('movimientos_caja_mayor', {
    p_desde: rango.desde,
    p_hasta: rango.hasta,
  });
  return (data ?? []).map((m) => aMovimiento(m));
}

/**
 * Pasa efectivo del cajón a la Parte Efectivo durante el turno.
 * Lanza `TURNO_CERRADO` o `DATOS_INVALIDOS` según el caso.
 */
export async function registrarRetiro(e: EntradaRetiro): Promise<MovimientoMayor> {
  const nota = e.nota?.trim() ? e.nota.trim() : null;
  const m = await llamarRpc<MovimientoCrudo>('registrar_retiro', {
    p_clave: e.clave,
    p_turno: e.turnoId,
    p_valor: e.valor,
    p_persona: e.persona,
    p_nota: nota,
  });
  return aMovimiento(m, { tipo: 'retiro', turnoId: e.turnoId, persona: e.persona, descripcion: nota });
}

/**
 * Ajuste manual de una Parte. Un saldo que quedaría negativo lanza
 * `SALDO_INSUFICIENTE: <Parte>`.
 */
export async function ajustarCajaMayor(e: EntradaAjuste): Promise<MovimientoMayor> {
  const m = await llamarRpc<MovimientoCrudo>('ajustar_caja_mayor', {
    p_clave: e.clave,
    p_parte: e.parteId,
    p_valor: e.valor,
    p_motivo: e.motivo,
    p_persona: e.persona,
  });
  return aMovimiento(m, { tipo: 'ajuste', parteId: e.parteId, persona: e.persona, descripcion: e.motivo });
}
