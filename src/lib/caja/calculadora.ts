/**
 * Estado puro de la Calculadora (venta por valor): valor digitado, lista de
 * valores agregados y límites. Sin dependencias de React ni del DOM.
 */

/** Valor digitado máximo en COP (Req 3.5). */
export const VALOR_MAX = 10_000_000;
/** Cantidad máxima de valores en la lista (Req 4.3). */
export const VALORES_MAX = 200;
/** Total máximo de la lista en COP (Req 4.3). */
export const TOTAL_MAX = 99_999_999;

export type TeclaCalculadora =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '000'
  | 'retroceso'
  | 'borrar';

/** Valor de la lista con un id local para poder quitar uno solo. */
export type ValorLista = { id: number; valor: number };
export type EstadoCalculadora = { digitado: number; valores: ValorLista[]; siguienteId: number };
export type AvisoCalculadora = 'VALOR_MAXIMO' | 'VALORES_MAXIMOS' | 'TOTAL_MAXIMO' | 'VACIO';

export type AccionCalculadora =
  | { tipo: 'tecla'; tecla: TeclaCalculadora }
  | { tipo: 'agregar' }
  | { tipo: 'quitar'; id: number }
  | { tipo: 'vaciar' };

export const CALCULADORA_INICIAL: EstadoCalculadora = { digitado: 0, valores: [], siguienteId: 1 };

/**
 * Aplica una tecla al valor digitado (Req 3.4–3.7).
 * - dígito: digitado · 10 + d; `000`: digitado · 1000.
 * - si el resultado pasaría de VALOR_MAX, devuelve el mismo valor con aviso.
 * - retroceso: floor(digitado / 10); borrar: 0.
 */
export function teclear(
  digitado: number,
  tecla: TeclaCalculadora
): { digitado: number; aviso?: 'VALOR_MAXIMO' } {
  if (tecla === 'borrar') return { digitado: 0 };
  if (tecla === 'retroceso') return { digitado: Math.floor(digitado / 10) };
  const siguiente = tecla === '000' ? digitado * 1000 : digitado * 10 + Number(tecla);
  if (siguiente > VALOR_MAX) return { digitado, aviso: 'VALOR_MAXIMO' };
  return { digitado: siguiente };
}

/** Suma de los valores de la lista (Req 4.4, 4.5). */
export const totalValores = (v: ValorLista[]): number => v.reduce((s, x) => s + x.valor, 0);

/** Aviso si agregar `valor` rompería un límite de la lista; null si cabe (Req 4.3). */
function avisoAgregar(e: EstadoCalculadora, valor: number): AvisoCalculadora | null {
  if (e.valores.length + 1 > VALORES_MAX) return 'VALORES_MAXIMOS';
  if (totalValores(e.valores) + valor > TOTAL_MAX) return 'TOTAL_MAXIMO';
  return null;
}

function agregarDigitado(e: EstadoCalculadora): EstadoCalculadora {
  return {
    digitado: 0,
    valores: [...e.valores, { id: e.siguienteId, valor: e.digitado }],
    siguienteId: e.siguienteId + 1,
  };
}

/** Reducer puro de la Calculadora; ante un aviso deja el estado igual. */
export function reducirCalculadora(
  e: EstadoCalculadora,
  a: AccionCalculadora
): { estado: EstadoCalculadora; aviso?: AvisoCalculadora } {
  switch (a.tipo) {
    case 'tecla': {
      const r = teclear(e.digitado, a.tecla);
      if (r.aviso) return { estado: e, aviso: r.aviso };
      return { estado: r.digitado === e.digitado ? e : { ...e, digitado: r.digitado } };
    }
    case 'agregar': {
      if (e.digitado <= 0) return { estado: e };
      const aviso = avisoAgregar(e, e.digitado);
      if (aviso) return { estado: e, aviso };
      return { estado: agregarDigitado(e) };
    }
    case 'quitar': {
      if (!e.valores.some((v) => v.id === a.id)) return { estado: e };
      return { estado: { ...e, valores: e.valores.filter((v) => v.id !== a.id) } };
    }
    case 'vaciar':
      return { estado: { ...e, digitado: 0, valores: [] } };
  }
}

/**
 * Valores para cobrar: la lista más el digitado pendiente si es > 0 (Req 5.2, 5.3).
 * Falla con el aviso del límite si el digitado no cabe, y con VACIO si no hay nada.
 */
export function valoresParaCobrar(
  e: EstadoCalculadora
): { ok: true; estado: EstadoCalculadora; valores: number[] } | { ok: false; aviso: AvisoCalculadora } {
  let estado = e;
  if (e.digitado > 0) {
    const aviso = avisoAgregar(e, e.digitado);
    if (aviso) return { ok: false, aviso };
    estado = agregarDigitado(e);
  }
  if (estado.valores.length === 0) return { ok: false, aviso: 'VACIO' };
  return { ok: true, estado, valores: estado.valores.map((v) => v.valor) };
}
