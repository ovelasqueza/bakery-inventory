import { ErrorApp, llamarRpc, traducirError } from '@/lib/api/errores';
import { eliminarGasto, registrarGasto } from '@/lib/api/gastos';
import type { Rango } from '@/lib/fechas/bogota';
import { supabase } from '@/lib/supabase';

const TIEMPO_LIMITE_MS = 15_000;
const CLAVE_CONFIG_RESPALDO = 'vales_empleados_v1';
const CATEGORIA_VALES_CAJA = 'Vales de caja';

export interface Vale {
  id: string;
  turnoId: string;
  empleado: string;
  valor: number;
  descripcion: string;
  /** true = se sacó dinero en efectivo de la caja (se resta del turno); false = producto/consumo. */
  saleDeCaja: boolean;
  creadoEn: string;
}

export interface EntradaVale {
  clave: string;
  turnoId: string;
  empleado: string;
  valor: number;
  descripcion: string;
  saleDeCaja: boolean;
}

interface ValeCrudo {
  id: string;
  turno_id: string;
  empleado: string;
  valor: number;
  descripcion: string;
  sale_de_caja: boolean;
  creado_en: string;
}

interface ValeRespaldo extends Vale {
  clave: string;
  eliminadoEn: string | null;
  gastoVinculadoId: string | null;
}

function sinConexion(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function aVale(v: ValeCrudo): Vale {
  return {
    id: v.id,
    turnoId: v.turno_id,
    empleado: v.empleado,
    valor: Number(v.valor),
    descripcion: v.descripcion,
    saleDeCaja: Boolean(v.sale_de_caja),
    creadoEn: v.creado_en,
  };
}

function esFaltaMigracionVales(e: unknown): boolean {
  if (!(e instanceof ErrorApp) || e.codigo !== 'DESCONOCIDO') return false;
  const d = e.detalle as { code?: unknown; message?: unknown } | null | undefined;
  if (!d || typeof d !== 'object') return false;
  const code = typeof d.code === 'string' ? d.code : '';
  const msg = typeof d.message === 'string' ? d.message : '';
  return (
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42883' ||
    /registrar_vale|eliminar_vale|relation .*vales|table .*vales/i.test(msg)
  );
}

async function leerValesRespaldo(): Promise<ValeRespaldo[]> {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', CLAVE_CONFIG_RESPALDO)
    .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS))
    .maybeSingle();
  if (error || !data?.valor) return [];
  try {
    const parsed = JSON.parse(String(data.valor));
    return Array.isArray(parsed) ? (parsed as ValeRespaldo[]) : [];
  } catch {
    return [];
  }
}

async function guardarValesRespaldo(lista: ValeRespaldo[]): Promise<void> {
  const { error, status } = await supabase
    .from('configuracion')
    .upsert(
      {
        clave: CLAVE_CONFIG_RESPALDO,
        valor: JSON.stringify(lista),
        descripcion: 'Registro de vales de empleados (respaldo automático)',
      },
      { onConflict: 'clave' }
    )
    .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  if (error) throw traducirError(error, status);
}

async function obtenerOCrearCategoriaVales(): Promise<string> {
  const { data: existentes } = await supabase
    .from('categorias_gasto')
    .select('id, nombre, activo')
    .order('orden', { ascending: true })
    .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));

  const lista = existentes ?? [];
  const exacta = lista.find((c) => c.nombre.trim().toLowerCase() === CATEGORIA_VALES_CAJA.toLowerCase());
  if (exacta) {
    if (!exacta.activo) {
      await supabase.from('categorias_gasto').update({ activo: true }).eq('id', exacta.id);
    }
    return String(exacta.id);
  }

  const { data: creada } = await supabase
    .from('categorias_gasto')
    .insert({ nombre: CATEGORIA_VALES_CAJA, activo: true, orden: 99 })
    .select('id')
    .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS))
    .single();

  if (creada?.id) return String(creada.id);

  const activa = lista.find((c) => c.activo) ?? lista[0];
  if (activa?.id) return String(activa.id);
  throw new ErrorApp('DATOS_INVALIDOS');
}

function combinarSinDuplicados(nativos: Vale[], respaldo: ValeRespaldo[]): Vale[] {
  const ids = new Set(nativos.map((v) => v.id));
  const vigentesRespaldo = respaldo
    .filter((v) => !v.eliminadoEn && !ids.has(v.id))
    .map((v) => ({
      id: v.id,
      turnoId: v.turnoId,
      empleado: v.empleado,
      valor: Number(v.valor),
      descripcion: v.descripcion,
      saleDeCaja: Boolean(v.saleDeCaja),
      creadoEn: v.creadoEn,
    }));
  return [...nativos, ...vigentesRespaldo];
}

/** Vales vigentes del turno, del más reciente al más antiguo. */
export async function valesDelTurno(turnoId: string): Promise<Vale[]> {
  if (sinConexion()) throw new ErrorApp('SIN_CONEXION');

  const respaldo = await leerValesRespaldo();
  const respaldoTurno = respaldo.filter((v) => v.turnoId === turnoId);

  let respuesta;
  try {
    respuesta = await supabase
      .from('vales')
      .select('id, turno_id, empleado, valor, descripcion, sale_de_caja, creado_en')
      .eq('turno_id', turnoId)
      .is('eliminado_en', null)
      .order('creado_en', { ascending: false })
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  } catch (e) {
    throw traducirError(e);
  }

  const { data, error, status } = respuesta;
  if (error) {
    const err = traducirError(error, status);
    if (esFaltaMigracionVales(err)) {
      return combinarSinDuplicados([], respaldoTurno).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
    }
    throw err;
  }

  const nativos = ((data ?? []) as ValeCrudo[]).map(aVale);
  return combinarSinDuplicados(nativos, respaldoTurno).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

/**
 * Registra un vale de empleado en el turno abierto.
 * Si `saleDeCaja` es `true`, resta del efectivo esperado del turno para cuadrar caja.
 */
export async function registrarVale(entrada: EntradaVale): Promise<Vale> {
  try {
    const data = await llamarRpc<ValeCrudo>('registrar_vale', {
      p_clave: entrada.clave,
      p_turno: entrada.turnoId,
      p_empleado: entrada.empleado,
      p_valor: entrada.valor,
      p_descripcion: entrada.descripcion,
      p_sale_de_caja: entrada.saleDeCaja,
    });
    return aVale(data);
  } catch (e) {
    if (!esFaltaMigracionVales(e)) throw e;
  }

  // Respaldo automático cuando aún no se ha corrido supabase/migration-vales.sql
  const lista = await leerValesRespaldo();
  const existente = lista.find((v) => v.clave === entrada.clave);
  if (existente) {
    return {
      id: existente.id,
      turnoId: existente.turnoId,
      empleado: existente.empleado,
      valor: existente.valor,
      descripcion: existente.descripcion,
      saleDeCaja: existente.saleDeCaja,
      creadoEn: existente.creadoEn,
    };
  }

  // Verificar que el turno siga abierto
  const { data: turnoData, error: errTurno, status: stTurno } = await supabase
    .from('turnos')
    .select('id, cerrado_en')
    .eq('id', entrada.turnoId)
    .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS))
    .maybeSingle();
  if (errTurno) throw traducirError(errTurno, stTurno);
  if (!turnoData || turnoData.cerrado_en !== null) {
    throw new ErrorApp('TURNO_CERRADO');
  }

  let gastoVinculadoId: string | null = null;
  if (entrada.saleDeCaja) {
    const categoriaId = await obtenerOCrearCategoriaVales();
    const conceptoGasto = `Vale (${entrada.empleado.trim()}): ${entrada.descripcion.trim()}`.slice(0, 120);
    const gasto = await registrarGasto({
      clave: entrada.clave,
      turnoId: entrada.turnoId,
      valor: entrada.valor,
      concepto: conceptoGasto,
      categoriaId,
      persona: entrada.empleado.trim(),
      origenes: [{ parteId: null, valor: entrada.valor }],
    });
    gastoVinculadoId = gasto.id;
  }

  const nuevo: ValeRespaldo = {
    id: entrada.clave,
    clave: entrada.clave,
    turnoId: entrada.turnoId,
    empleado: entrada.empleado.trim(),
    valor: entrada.valor,
    descripcion: entrada.descripcion.trim(),
    saleDeCaja: entrada.saleDeCaja,
    creadoEn: new Date().toISOString(),
    eliminadoEn: null,
    gastoVinculadoId,
  };

  await guardarValesRespaldo([nuevo, ...lista]);
  return {
    id: nuevo.id,
    turnoId: nuevo.turnoId,
    empleado: nuevo.empleado,
    valor: nuevo.valor,
    descripcion: nuevo.descripcion,
    saleDeCaja: nuevo.saleDeCaja,
    creadoEn: nuevo.creadoEn,
  };
}

/** Anula un vale mientras el turno sigue abierto. */
export async function eliminarVale(valeId: string): Promise<void> {
  const lista = await leerValesRespaldo();
  const enRespaldo = lista.find((v) => v.id === valeId);

  if (enRespaldo) {
    if (enRespaldo.eliminadoEn) return;
    if (enRespaldo.gastoVinculadoId) {
      await eliminarGasto(enRespaldo.gastoVinculadoId);
    } else {
      const { data: turnoData } = await supabase
        .from('turnos')
        .select('cerrado_en')
        .eq('id', enRespaldo.turnoId)
        .maybeSingle();
      if (!turnoData || turnoData.cerrado_en !== null) {
        throw new ErrorApp('TURNO_CERRADO');
      }
    }
    const actualizada = lista.map((v) =>
      v.id === valeId ? { ...v, eliminadoEn: new Date().toISOString() } : v
    );
    await guardarValesRespaldo(actualizada);
    return;
  }

  await llamarRpc<null>('eliminar_vale', { p_vale: valeId });
}

/** IDs de gastos creados como respaldo para vales de caja, para no duplicarlos en el reporte de Gastos. */
export async function obtenerIdsGastosValesRespaldo(): Promise<Set<string>> {
  const lista = await leerValesRespaldo();
  const ids = new Set<string>();
  for (const v of lista) {
    if (v.gastoVinculadoId) ids.add(v.gastoVinculadoId);
  }
  return ids;
}

/** Vales vigentes dentro del rango de fechas (inclusive, zona horaria America/Bogota). */
export async function obtenerValesRango(rango: Rango): Promise<Vale[]> {
  if (sinConexion()) throw new ErrorApp('SIN_CONEXION');

  const inicioIso = `${rango.desde}T00:00:00.000-05:00`;
  const finIso = `${rango.hasta}T23:59:59.999-05:00`;
  const desdeMs = new Date(inicioIso).getTime();
  const hastaMs = new Date(finIso).getTime();

  const respaldo = await leerValesRespaldo();
  const respaldoEnRango = respaldo.filter((v) => {
    if (v.eliminadoEn) return false;
    const t = new Date(v.creadoEn).getTime();
    return t >= desdeMs && t <= hastaMs;
  });

  let respuesta;
  try {
    respuesta = await supabase
      .from('vales')
      .select('id, turno_id, empleado, valor, descripcion, sale_de_caja, creado_en')
      .gte('creado_en', inicioIso)
      .lte('creado_en', finIso)
      .is('eliminado_en', null)
      .order('creado_en', { ascending: true })
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  } catch (e) {
    throw traducirError(e);
  }

  const { data, error, status } = respuesta;
  if (error) {
    const err = traducirError(error, status);
    if (esFaltaMigracionVales(err)) {
      return combinarSinDuplicados([], respaldoEnRango).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
    }
    throw err;
  }

  const nativos = ((data ?? []) as ValeCrudo[]).map(aVale);
  return combinarSinDuplicados(nativos, respaldoEnRango).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}
