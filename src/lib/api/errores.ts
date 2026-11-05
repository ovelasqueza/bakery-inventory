import { supabase } from '@/lib/supabase';

export type CodigoError =
  | 'SIN_CONEXION' | 'TURNO_CERRADO' | 'TURNO_NO_ABIERTO' | 'PRECIOS_ACTUALIZADOS'
  | 'PRODUCTO_NO_DISPONIBLE' | 'METODO_INVALIDO' | 'RECIBIDO_INVALIDO' | 'DATOS_INVALIDOS'
  | 'VENTA_NO_EXISTE' | 'GASTO_NO_EXISTE' | 'PIN_INCORRECTO' | 'PIN_INVALIDO'
  | 'NOMBRE_REPETIDO' | 'SIN_METODO_EFECTIVO' | 'RANGO_INVALIDO' | 'SALDO_INSUFICIENTE'
  | 'ORIGEN_INVALIDO' | 'AUTOCONSUMO_NO_EXISTE' | 'TURNO_NO_CERRADO' | 'DESCONOCIDO';

export class ErrorApp extends Error {
  constructor(public codigo: CodigoError, public detalle?: unknown) {
    super(codigo);
    this.name = 'ErrorApp';
  }
}

/** Códigos que las funciones SQL lanzan con `RAISE EXCEPTION 'CODIGO'`. */
const CODIGOS_SQL: readonly CodigoError[] = [
  'TURNO_CERRADO', 'TURNO_NO_ABIERTO', 'PRECIOS_ACTUALIZADOS', 'PRODUCTO_NO_DISPONIBLE',
  'METODO_INVALIDO', 'RECIBIDO_INVALIDO', 'DATOS_INVALIDOS', 'VENTA_NO_EXISTE',
  'GASTO_NO_EXISTE', 'PIN_INCORRECTO', 'PIN_INVALIDO', 'NOMBRE_REPETIDO',
  'SIN_METODO_EFECTIVO', 'RANGO_INVALIDO', 'SALDO_INSUFICIENTE', 'ORIGEN_INVALIDO',
  'AUTOCONSUMO_NO_EXISTE', 'TURNO_NO_CERRADO',
];

/** Forma mínima de un error devuelto o lanzado por supabase-js. */
interface ErrorCrudo {
  message?: unknown;
  code?: unknown;
  name?: unknown;
}

function sinConexion(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Errores de red o de tiempo agotado: no hubo respuesta del servidor. */
function esErrorDeRed(error: ErrorCrudo, status?: number): boolean {
  const nombre = typeof error.name === 'string' ? error.name : '';
  if (nombre === 'AbortError' || nombre === 'TimeoutError') return true;
  if (error.code === 'ABORT_ERR') return true;
  const mensaje = typeof error.message === 'string' ? error.message : '';
  if (/^(AbortError|TimeoutError)\b/.test(mensaje)) return true;
  if (/Failed to fetch|NetworkError|Load failed|network request failed/i.test(mensaje)) return true;
  // postgrest-js devuelve status 0 cuando fetch falla y no hay respuesta HTTP.
  return status === 0;
}

/**
 * Traduce un error de Supabase (RPC o consulta directa a tabla) a `ErrorApp`.
 * Mensajes como `'MOVIMIENTO_INMUTABLE: ...'` no tienen código propio y quedan como `DESCONOCIDO`.
 */
export function traducirError(error: unknown, status?: number): ErrorApp {
  if (error instanceof ErrorApp) return error;
  if (error === null || typeof error !== 'object') {
    return new ErrorApp(sinConexion() ? 'SIN_CONEXION' : 'DESCONOCIDO', error);
  }
  const crudo = error as ErrorCrudo;
  if (esErrorDeRed(crudo, status) || sinConexion()) return new ErrorApp('SIN_CONEXION', error);

  const mensaje = typeof crudo.message === 'string' ? crudo.message.trim() : '';
  const codigo = CODIGOS_SQL.find(
    (c) => mensaje === c || (mensaje.startsWith(c) && !/[A-Z0-9_]/.test(mensaje.charAt(c.length))),
  );
  if (codigo) return new ErrorApp(codigo, error);

  if (crudo.code === '23505') return new ErrorApp('NOMBRE_REPETIDO', error);
  return new ErrorApp('DESCONOCIDO', error);
}

/**
 * Nombre de la Parte de un error `SALDO_INSUFICIENTE`, que el servidor envía como
 * `'SALDO_INSUFICIENTE: <Parte>'`. Devuelve `null` para otros códigos o si falta el nombre.
 */
export function parteDeError(e: ErrorApp): string | null {
  if (e.codigo !== 'SALDO_INSUFICIENTE') return null;
  const detalle = e.detalle;
  if (detalle === null || typeof detalle !== 'object') return null;
  const mensaje = (detalle as ErrorCrudo).message;
  if (typeof mensaje !== 'string') return null;
  const i = mensaje.indexOf(': ');
  if (i < 0) return null;
  const parte = mensaje.slice(i + 2).trim();
  return parte === '' ? null : parte;
}

/**
 * Llama una función RPC con tiempo límite (15 s por defecto).
 * Sin conexión no llama al servidor (Req 17.7); abortos y fallos de red dan `SIN_CONEXION`.
 */
export async function llamarRpc<T>(nombre: string, args: object, ms = 15_000): Promise<T> {
  if (sinConexion()) throw new ErrorApp('SIN_CONEXION');

  let respuesta;
  try {
    respuesta = await supabase.rpc(nombre, args).abortSignal(AbortSignal.timeout(ms));
  } catch (e) {
    throw traducirError(e);
  }
  const { data, error, status } = respuesta;
  if (error) throw traducirError(error, status);
  return data as T;
}
