import { supabase } from '@/lib/supabase';
import { ErrorApp, llamarRpc, traducirError } from './errores';

const TIEMPO_LIMITE_MS = 15_000;

/** Producto consumido, con el nombre y precio de venta copiados al registrar. */
export type LineaAutoconsumo = {
  productoId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
};

/** Autoconsumo del turno. `anuladoEn` no nulo = anulado (no suma al total). */
export type Autoconsumo = {
  id: string;
  turnoId: string;
  consumidoPor: string;
  nota: string | null;
  valorReferencia: number;
  creadoEn: string;
  anuladoEn: string | null;
  lineas: LineaAutoconsumo[];
};

export type EntradaAutoconsumo = {
  /** Clave de idempotencia (UUID) generada por el cliente; se reutiliza en reintentos. */
  clave: string;
  turnoId: string;
  persona: string;
  nota: string | null;
  lineas: { productoId: string; cantidad: number }[];
};

interface LineaCruda {
  producto_id: string;
  nombre_producto: string;
  cantidad: number;
  precio_referencia: number;
  subtotal: number | null;
}

interface AutoconsumoCrudo {
  id: string;
  turno_id: string;
  consumido_por: string;
  nota: string | null;
  valor_referencia: number;
  creado_en: string;
  anulado_en: string | null;
}

interface AutoconsumoRpc extends AutoconsumoCrudo {
  lineas: LineaCruda[] | null;
}

interface FilaAutoconsumo extends AutoconsumoCrudo {
  autoconsumo_detalles: LineaCruda[] | null;
}

function aLineas(lista: LineaCruda[] | null | undefined): LineaAutoconsumo[] {
  return (lista ?? [])
    .map((l) => {
      const cantidad = Number(l.cantidad);
      const precio = Number(l.precio_referencia);
      return {
        productoId: l.producto_id,
        nombre: l.nombre_producto,
        cantidad,
        precio,
        subtotal: l.subtotal == null ? cantidad * precio : Number(l.subtotal),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.productoId.localeCompare(b.productoId));
}

function aAutoconsumo(a: AutoconsumoCrudo, lineas: LineaCruda[] | null | undefined): Autoconsumo {
  return {
    id: a.id,
    turnoId: a.turno_id,
    consumidoPor: a.consumido_por,
    nota: a.nota ?? null,
    valorReferencia: Number(a.valor_referencia),
    creadoEn: a.creado_en,
    anuladoEn: a.anulado_en ?? null,
    lineas: aLineas(lineas),
  };
}

/**
 * Registra un Autoconsumo del turno (no toca dinero, ventas ni inventarios).
 * Lanza `TURNO_CERRADO`, `PRODUCTO_NO_DISPONIBLE` o `DATOS_INVALIDOS` según el caso.
 * Un reintento con la misma clave devuelve el Autoconsumo original.
 */
export async function registrarAutoconsumo(e: EntradaAutoconsumo): Promise<Autoconsumo> {
  const a = await llamarRpc<AutoconsumoRpc>('registrar_autoconsumo', {
    p_clave: e.clave,
    p_turno: e.turnoId,
    p_persona: e.persona,
    p_nota: e.nota,
    p_lineas: e.lineas.map((l) => ({ producto_id: l.productoId, cantidad: l.cantidad })),
  });
  return aAutoconsumo(a, a.lineas);
}

/** Lectura directa (RLS de solo lectura) con autoconsumo_detalles embebidos, más reciente primero. Incluye los anulados. */
export async function autoconsumosDelTurno(turnoId: string): Promise<Autoconsumo[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErrorApp('SIN_CONEXION');
  }

  let respuesta;
  try {
    respuesta = await supabase
      .from('autoconsumos')
      .select(
        'id, turno_id, consumido_por, nota, valor_referencia, creado_en, anulado_en, autoconsumo_detalles(producto_id, nombre_producto, cantidad, precio_referencia, subtotal)',
      )
      .eq('turno_id', turnoId)
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false })
      .abortSignal(AbortSignal.timeout(TIEMPO_LIMITE_MS));
  } catch (err) {
    throw traducirError(err);
  }

  const { data, error, status } = respuesta;
  if (error) throw traducirError(error, status);

  return ((data ?? []) as unknown as FilaAutoconsumo[]).map((f) =>
    aAutoconsumo(f, f.autoconsumo_detalles),
  );
}

/**
 * Marca el Autoconsumo como anulado. Repetirlo no falla.
 * Lanza `AUTOCONSUMO_NO_EXISTE` o, con el turno cerrado, `TURNO_CERRADO`.
 */
export async function anularAutoconsumo(id: string): Promise<void> {
  await llamarRpc<null>('anular_autoconsumo', { p_autoconsumo: id });
}
