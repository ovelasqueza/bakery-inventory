import { limitesUtc, type Rango } from '@/lib/fechas/bogota';
import { supabase } from '@/lib/supabase';
import { ErrorApp, llamarRpc, traducirError } from './errores';

const TIEMPO_LIMITE_MS = 15_000;
const CLAVE_GASTOS_TURNOS_CERRADOS = 'gastos_turnos_cerrados_v1';

/** De dónde sale el dinero de un gasto. `parteId = null` significa Cajón. */
export interface OrigenGasto {
  parteId: string | null;
  valor: number;
}

/** Gasto del turno o del historial tal como lo muestra el panel de Gastos. */
export interface GastoTurno {
  id: string;
  turnoId: string | null;
  valor: number;
  concepto: string;
  categoriaId: string;
  categoriaNombre: string;
  registradoPor: string;
  creadoEn: string;
  /** Vacío en gastos antiguos: cuentan como 100 % Cajón. */
  origenes: OrigenGasto[];
  /** true si fue agregado posteriormente a un turno ya cerrado. */
  esDeTurnoCerrado?: boolean;
}

export interface TurnoCerradoResumen {
  id: string;
  abiertoPor: string;
  abiertoEn: string;
  cerradoPor: string;
  cerradoEn: string;
}

export interface GastoTurnoCerradoRespaldo {
  id: string;
  clave: string;
  turnoId: string;
  valor: number;
  concepto: string;
  categoriaId: string;
  categoriaNombre: string;
  registradoPor: string;
  creadoEn: string;
  eliminadoEn: string | null;
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
  turno_id: string | null;
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

function mapearFilasGasto(filas: FilaGasto[]): GastoTurno[] {
  return filas.map((f) => ({
    id: f.id,
    turnoId: f.turno_id ?? null,
    valor: Number(f.valor),
    concepto: f.concepto,
    categoriaId: f.categoria_gasto_id,
    categoriaNombre: nombreCategoria(f.categorias_gasto),
    registradoPor: f.registrado_por,
    creadoEn: f.creado_en,
    origenes: aOrigenes(f.gasto_origenes),
  }));
}

async function leerGastosTurnosCerrados(): Promise<GastoTurnoCerradoRespaldo[]> {
  try {
    const { data, error } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', CLAVE_GASTOS_TURNOS_CERRADOS)
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS))
      .maybeSingle();
    if (error || !data?.valor) return [];
    const parsed = JSON.parse(String(data.valor));
    return Array.isArray(parsed) ? (parsed as GastoTurnoCerradoRespaldo[]) : [];
  } catch {
    return [];
  }
}

async function guardarGastosTurnosCerrados(lista: GastoTurnoCerradoRespaldo[]): Promise<void> {
  const { error, status } = await supabase
    .from('configuracion')
    .upsert(
      {
        clave: CLAVE_GASTOS_TURNOS_CERRADOS,
        valor: JSON.stringify(lista),
        descripcion: 'Gastos asignados a turnos ya cerrados',
      },
      { onConflict: 'clave' }
    )
    .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  if (error) throw traducirError(error, status);
}

/** Devuelve todos los gastos activos agregados a turnos cerrados. */
export async function obtenerGastosTurnosCerradosActivos(): Promise<GastoTurnoCerradoRespaldo[]> {
  const todos = await leerGastosTurnosCerrados();
  return todos.filter((g) => g.eliminadoEn === null);
}

function aGastoTurnoCerrado(g: GastoTurnoCerradoRespaldo): GastoTurno {
  return {
    id: g.id,
    turnoId: g.turnoId,
    valor: Number(g.valor),
    concepto: g.concepto,
    categoriaId: g.categoriaId,
    categoriaNombre: g.categoriaNombre,
    registradoPor: g.registradoPor,
    creadoEn: g.creadoEn,
    origenes: [{ parteId: null, valor: Number(g.valor) }],
    esDeTurnoCerrado: true,
  };
}

/** Lista los últimos turnos cerrados para poder asignarles un gasto olvidado. */
export async function listarTurnosCerradosRecientes(limite = 15): Promise<TurnoCerradoResumen[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErrorApp('SIN_CONEXION');
  }

  let respuesta;
  try {
    respuesta = await supabase
      .from('turnos')
      .select('id, abierto_por, abierto_en, cerrado_por, cerrado_en')
      .not('cerrado_en', 'is', null)
      .order('cerrado_en', { ascending: false })
      .limit(limite)
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  } catch (e) {
    throw traducirError(e);
  }

  const { data, error, status } = respuesta;
  if (error) throw traducirError(error, status);

  return ((data ?? []) as { id: string; abierto_por: string; abierto_en: string; cerrado_por: string | null; cerrado_en: string }[]).map((t) => ({
    id: t.id,
    abiertoPor: t.abierto_por,
    abiertoEn: t.abierto_en,
    cerradoPor: t.cerrado_por ?? '',
    cerradoEn: t.cerrado_en,
  }));
}

/**
 * Registra un gasto olvidado directamente dentro de un turno que ya fue cerrado,
 * descontándolo del efectivo esperado de ese turno cerrado para cuadrar su cierre.
 */
export async function registrarGastoTurnoCerrado(entrada: {
  clave: string;
  turnoId: string;
  cerradoEn: string;
  valor: number;
  concepto: string;
  categoriaId: string;
  categoriaNombre: string;
  persona: string;
}): Promise<GastoRegistrado> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErrorApp('SIN_CONEXION');
  }

  const lista = await leerGastosTurnosCerrados();
  const existente = lista.find((g) => g.clave === entrada.clave);
  if (existente) {
    return {
      id: existente.id,
      turnoId: existente.turnoId,
      valor: existente.valor,
      concepto: existente.concepto,
      categoriaId: existente.categoriaId,
      registradoPor: existente.registradoPor,
      creadoEn: existente.creadoEn,
      origenes: [{ parteId: null, valor: existente.valor }],
    };
  }

  // Fecha 1 segundo antes del cierre del turno para que pertenezca al mismo día y turno
  const msCierre = Date.parse(entrada.cerradoEn);
  const creadoEn = Number.isNaN(msCierre)
    ? new Date().toISOString()
    : new Date(msCierre - 1000).toISOString();

  const nuevo: GastoTurnoCerradoRespaldo = {
    id: entrada.clave,
    clave: entrada.clave,
    turnoId: entrada.turnoId,
    valor: entrada.valor,
    concepto: entrada.concepto.trim(),
    categoriaId: entrada.categoriaId,
    categoriaNombre: entrada.categoriaNombre,
    registradoPor: entrada.persona.trim(),
    creadoEn,
    eliminadoEn: null,
  };

  lista.push(nuevo);
  await guardarGastosTurnosCerrados(lista);

  return {
    id: nuevo.id,
    turnoId: nuevo.turnoId,
    valor: nuevo.valor,
    concepto: nuevo.concepto,
    categoriaId: nuevo.categoriaId,
    registradoPor: nuevo.registradoPor,
    creadoEn: nuevo.creadoEn,
    origenes: [{ parteId: null, valor: nuevo.valor }],
  };
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

  const base = mapearFilasGasto((data ?? []) as unknown as FilaGasto[]);
  const extras = (await obtenerGastosTurnosCerradosActivos())
    .filter((g) => g.turnoId === turnoId)
    .map(aGastoTurnoCerrado);

  return [...base, ...extras].sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn));
}

/**
 * Gastos no eliminados de todos los turnos dentro del rango de fechas locales [desde, hasta],
 * ordenados del más reciente al más antiguo.
 */
export async function gastosPorRango(rango: Rango): Promise<GastoTurno[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErrorApp('SIN_CONEXION');
  }

  const { inicio, fin } = limitesUtc(rango);
  let respuesta;
  try {
    respuesta = await supabase
      .from('gastos')
      .select(
        'id, turno_id, valor, concepto, categoria_gasto_id, registrado_por, creado_en, categorias_gasto(nombre), gasto_origenes(parte_id, valor)',
      )
      .gte('creado_en', inicio)
      .lt('creado_en', fin)
      .is('eliminado_en', null)
      .order('creado_en', { ascending: false })
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  } catch (e) {
    throw traducirError(e);
  }

  const { data, error, status } = respuesta;
  if (error) throw traducirError(error, status);

  const base = mapearFilasGasto((data ?? []) as unknown as FilaGasto[]);
  const msInicio = Date.parse(inicio);
  const msFin = Date.parse(fin);
  const extras = (await obtenerGastosTurnosCerradosActivos())
    .filter((g) => {
      const t = Date.parse(g.creadoEn);
      return t >= msInicio && t < msFin;
    })
    .map(aGastoTurnoCerrado);

  return [...base, ...extras].sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn));
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
 * Repetirlo no falla; con el turno cerrado lanza `TURNO_CERRADO` salvo para gastos agregados a turnos cerrados.
 */
export async function eliminarGasto(gastoId: string): Promise<void> {
  const listaCerrados = await leerGastosTurnosCerrados();
  const idx = listaCerrados.findIndex((g) => g.id === gastoId);
  if (idx >= 0) {
    if (listaCerrados[idx].eliminadoEn === null) {
      listaCerrados[idx] = { ...listaCerrados[idx], eliminadoEn: new Date().toISOString() };
      await guardarGastosTurnosCerrados(listaCerrados);
    }
    return;
  }
  await llamarRpc<null>('eliminar_gasto', { p_gasto: gastoId });
}
