import { supabase } from '@/lib/supabase';
import { ErrorApp, llamarRpc, traducirError } from './errores';

const TIEMPO_LIMITE_MS = 15_000;

/** De dónde sale el dinero de un gasto. `parteId = null` significa Cajón. */
export interface OrigenGasto {
  parteId: string | null;
  valor: number;
}

/** Gasto del turno tal como lo muestra el panel de Gastos. */
export interface GastoTurno {
  id: string;
  turnoId: string;
  valor: number;
  concepto: string;
  categoriaId: string;
  categoriaNombre: string;
  registradoPor: string;
  creadoEn: string;
  /** Vacío en gastos antiguos: cuentan como 100 % Cajón. */
  origenes: OrigenGasto[];
}

/** Gasto devuelto por `registrar_gasto`. */
export interface GastoRegistrado {
  id: string;
  /** `null` para un Gasto_Sin_Turno registrado desde Reportes. */
  turnoId: string | null;
  valor: number;
  concepto: string;
  categoriaId: string;
  registradoPor: string;
  creadoEn: string;
  origenes: OrigenGasto[];
}

export interface EntradaGasto {
  /** Clave de idempotencia (UUID) generada por el cliente; se reutiliza en reintentos. */
  clave: string;
  /** `null` = Gasto_Sin_Turno (solo desde la caja mayor, sin Cajón). */
  turnoId: string | null;
  valor: number;
  concepto: string;
  categoriaId: string;
  persona: string;
  /** Deben sumar `valor`. Vacío con turno equivale a todo del Cajón. */
  origenes: OrigenGasto[];
}

interface OrigenCrudo {
  parte_id: string | null;
  valor: number;
}

interface FilaGasto {
  id: string;
  turno_id: string;
  valor: number;
  concepto: string;
  categoria_gasto_id: string;
  registrado_por: string;
  creado_en: string;
  categorias_gasto: { nombre: string } | { nombre: string }[] | null;
  gasto_origenes: OrigenCrudo[] | null;
}

interface GastoRpc {
  id: string;
  turno_id: string | null;
  valor: number;
  concepto: string;
  categoria_gasto_id: string;
  registrado_por: string;
  creado_en: string;
  origenes: (OrigenCrudo & { nombre?: string })[] | null;
}

function nombreCategoria(c: FilaGasto['categorias_gasto']): string {
  if (Array.isArray(c)) return c[0]?.nombre ?? '';
  return c?.nombre ?? '';
}

function aOrigenes(lista: OrigenCrudo[] | null | undefined): OrigenGasto[] {
  return (lista ?? []).map((o) => ({ parteId: o.parte_id ?? null, valor: Number(o.valor) }));
}

/** Gastos no eliminados del turno, más reciente primero, con sus orígenes. */
export async function gastosDelTurno(turnoId: string): Promise<GastoTurno[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErrorApp('SIN_CONEXION');
  }

  let respuesta;
  try {
    respuesta = await supabase
      .from('gastos')
      .select(
        'id, turno_id, valor, concepto, categoria_gasto_id, registrado_por, creado_en, categorias_gasto(nombre), gasto_origenes(parte_id, valor)',
      )
      .eq('turno_id', turnoId)
      .is('eliminado_en', null)
      .order('creado_en', { ascending: false })
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  } catch (e) {
    throw traducirError(e);
  }

  const { data, error, status } = respuesta;
  if (error) throw traducirError(error, status);

  return ((data ?? []) as unknown as FilaGasto[]).map((f) => ({
    id: f.id,
    turnoId: f.turno_id,
    valor: f.valor,
    concepto: f.concepto,
    categoriaId: f.categoria_gasto_id,
    categoriaNombre: nombreCategoria(f.categorias_gasto),
    registradoPor: f.registrado_por,
    creadoEn: f.creado_en,
    origenes: aOrigenes(f.gasto_origenes),
  }));
}

/**
 * Registra un gasto con su origen (Cajón, Partes de la caja mayor o combinado).
 * Lanza `TURNO_CERRADO`, `ORIGEN_INVALIDO` o `SALDO_INSUFICIENTE: <Parte>` según el caso.
 */
export async function registrarGasto(entrada: EntradaGasto): Promise<GastoRegistrado> {
  const g = await llamarRpc<GastoRpc>('registrar_gasto', {
    p_clave: entrada.clave,
    p_turno: entrada.turnoId,
    p_valor: entrada.valor,
    p_concepto: entrada.concepto,
    p_categoria: entrada.categoriaId,
    p_persona: entrada.persona,
    p_origenes: entrada.origenes.map((o) => ({ parte_id: o.parteId, valor: o.valor })),
  });
  return {
    id: g.id,
    turnoId: g.turno_id ?? null,
    valor: g.valor,
    concepto: g.concepto,
    categoriaId: g.categoria_gasto_id,
    registradoPor: g.registrado_por,
    creadoEn: g.creado_en,
    origenes: aOrigenes(g.origenes),
  };
}

/**
 * Marca el gasto como eliminado y devuelve el dinero a las Partes de la caja mayor.
 * Repetirlo no falla; con el turno cerrado lanza `TURNO_CERRADO`.
 */
export async function eliminarGasto(gastoId: string): Promise<void> {
  await llamarRpc<null>('eliminar_gasto', { p_gasto: gastoId });
}
