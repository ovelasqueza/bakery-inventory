'use client';

/**
 * Pestaña Caja mayor: saldo por Parte y total, movimientos del rango, ajuste manual,
 * gasto sin turno y eliminación de Gasto_Sin_Turno. Cada consulta y acción revisa
 * antes el acceso por PIN y descarta respuestas viejas.
 *
 * Requisitos: 7.4, 8.1, 8.2, 8.3, 8.8
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { obtenerMovimientos, obtenerSaldos, type MovimientoMayor, type ParteCajaMayor } from '@/lib/api/cajaMayor';
import { ErrorApp } from '@/lib/api/errores';
import { eliminarGasto } from '@/lib/api/gastos';
import {
  listarCategoriasGasto,
  listarPersonasCaja,
  type CategoriaGastoParam,
  type PersonaCajaParam,
} from '@/lib/api/parametros';
import type { Rango } from '@/lib/fechas/bogota';
import {
  COLUMNA_ACCION,
  COLUMNA_SALDO,
  COLUMNA_VALOR,
  esGastoEliminable,
  nombreParte,
  ordenarMovimientos,
  partesVisibles,
  tablaMovimientos,
  totalSaldos,
  valorConSigno,
} from '@/lib/reportes/cajaMayor';
import type { Celda } from '@/lib/reportes/tablas';
import { formatCurrency } from '@/lib/utils';
import { DialogoAjusteMayor } from './DialogoAjusteMayor';
import { DialogoGastoMayor } from './DialogoGastoMayor';
import { useGuardaPin } from './GuardaPin';
import { TablaReporte } from './TablaReporte';

export interface SeccionCajaMayorProps {
  /** Rango aplicado en `FiltroRango`; solo filtra los movimientos. */
  rango: Rango;
  /** Por defecto, el de `useGuardaPin()`. */
  revisarAcceso?: () => boolean;
}

type Dialogo = 'ajuste' | 'gasto' | null;

interface EstadoSaldos {
  partes: ParteCajaMayor[] | null;
  cargando: boolean;
  error: string | null;
}

interface EstadoMovimientos {
  lista: MovimientoMayor[] | null;
  /** Rango al que corresponde `lista`. */
  rangoLista: Rango | null;
  cargando: boolean;
  error: string | null;
}

function codigoDe(e: unknown): string {
  return e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
}

function mensajeCarga(e: unknown, que: string): string {
  const codigo = codigoDe(e);
  if (codigo === 'SIN_CONEXION') return 'Sin conexión. Revise el internet y vuelva a intentar.';
  if (codigo === 'RANGO_INVALIDO') return 'El rango de fechas no es válido. Elija otro rango.';
  return `No se pudieron cargar ${que}. Intente de nuevo.`;
}

function mismoRango(a: Rango | null, b: Rango): boolean {
  return a !== null && a.desde === b.desde && a.hasta === b.hasta;
}

const claseBotonPrincipal =
  'min-h-[48px] min-w-[44px] rounded-2xl bg-lz-sage px-5 text-base font-bold text-lz-surface shadow-lz-soft transition-colors hover:bg-lz-sage-dark disabled:opacity-50';
const claseBotonSecundario =
  'min-h-[48px] min-w-[44px] rounded-2xl border-2 border-lz-border bg-lz-surface px-5 text-base font-semibold text-lz-charcoal transition-colors hover:border-lz-sage-medium hover:bg-lz-sage-light disabled:opacity-50';
const claseReintentar =
  'min-h-[44px] min-w-[44px] rounded-xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark disabled:opacity-50';

export function SeccionCajaMayor({ rango, revisarAcceso: revisarAccesoProp }: SeccionCajaMayorProps) {
  const guarda = useGuardaPin();
  const revisarAcceso = revisarAccesoProp ?? guarda.revisarAcceso;
  const { showToast } = useToast();

  const [saldos, setSaldos] = useState<EstadoSaldos>({ partes: null, cargando: false, error: null });
  const [movs, setMovs] = useState<EstadoMovimientos>({ lista: null, rangoLista: null, cargando: false, error: null });
  const [categorias, setCategorias] = useState<CategoriaGastoParam[]>([]);
  const [personas, setPersonas] = useState<PersonaCajaParam[]>([]);
  const [errorParametros, setErrorParametros] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [porEliminar, setPorEliminar] = useState<MovimientoMayor | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const pedSaldos = useRef(0);
  const pedMovs = useRef(0);
  const pedParams = useRef(0);

  const cargarSaldos = useCallback(async () => {
    if (!revisarAcceso()) return;
    const id = ++pedSaldos.current;
    setSaldos((prev) => ({ ...prev, cargando: true, error: null }));
    try {
      const partes = await obtenerSaldos();
      if (id !== pedSaldos.current) return;
      setSaldos({ partes, cargando: false, error: null });
    } catch (e) {
      if (id !== pedSaldos.current) return;
      setSaldos({ partes: null, cargando: false, error: mensajeCarga(e, 'los saldos') });
    }
  }, [revisarAcceso]);

  const cargarMovimientos = useCallback(
    async (r: Rango) => {
      if (!revisarAcceso()) return;
      const id = ++pedMovs.current;
      setMovs((prev) => ({ ...prev, cargando: true, error: null }));
      try {
        const lista = await obtenerMovimientos(r);
        if (id !== pedMovs.current) return;
        setMovs({ lista: ordenarMovimientos(lista), rangoLista: r, cargando: false, error: null });
      } catch (e) {
        if (id !== pedMovs.current) return;
        // Sin cifras de un rango distinto al elegido.
        setMovs((prev) =>
          mismoRango(prev.rangoLista, r)
            ? { ...prev, cargando: false, error: mensajeCarga(e, 'los movimientos') }
            : { lista: null, rangoLista: null, cargando: false, error: mensajeCarga(e, 'los movimientos') },
        );
      }
    },
    [revisarAcceso],
  );

  const cargarParametros = useCallback(async () => {
    if (!revisarAcceso()) return;
    const id = ++pedParams.current;
    setErrorParametros(false);
    try {
      const [cats, pers] = await Promise.all([listarCategoriasGasto(), listarPersonasCaja()]);
      if (id !== pedParams.current) return;
      setCategorias(cats);
      setPersonas(pers);
    } catch {
      if (id !== pedParams.current) return;
      setErrorParametros(true);
    }
  }, [revisarAcceso]);

  useEffect(() => {
    void cargarSaldos();
    void cargarParametros();
  }, [cargarSaldos, cargarParametros]);

  useEffect(() => {
    void cargarMovimientos(rango);
  }, [rango, cargarMovimientos]);

  // Respuestas pendientes al desmontar quedan descartadas.
  useEffect(
    () => () => {
      pedSaldos.current += 1;
      pedMovs.current += 1;
      pedParams.current += 1;
    },
    [],
  );

  // Req 8.8: tras un ajuste, un gasto o una eliminación se recargan saldos y movimientos.
  const recargarTodo = useCallback(() => {
    void cargarSaldos();
    void cargarMovimientos(rango);
  }, [cargarSaldos, cargarMovimientos, rango]);

  const recargarSaldos = useCallback(() => {
    void cargarSaldos();
  }, [cargarSaldos]);

  const cerrarDialogo = useCallback(() => setDialogo(null), []);

  function abrir(d: Exclude<Dialogo, null>) {
    if (!revisarAcceso()) return;
    setDialogo(d);
  }

  async function eliminar(m: MovimientoMayor) {
    if (!m.gastoId || !revisarAcceso()) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await eliminarGasto(m.gastoId);
      setPorEliminar(null);
      showToast('Gasto eliminado', 'success');
      recargarTodo();
    } catch (e) {
      setErrorEliminar(
        codigoDe(e) === 'SIN_CONEXION'
          ? 'Sin conexión. Revise el internet y vuelva a intentar.'
          : 'No se pudo eliminar. Intente de nuevo.',
      );
    } finally {
      setEliminando(false);
    }
  }

  // Esc cierra la confirmación de eliminación.
  useEffect(() => {
    if (!porEliminar) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !eliminando) setPorEliminar(null);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [porEliminar, eliminando]);

  const visibles = useMemo(() => (saldos.partes ? partesVisibles(saldos.partes) : []), [saldos.partes]);
  const total = useMemo(() => totalSaldos(saldos.partes ?? []), [saldos.partes]);
  const lista = mismoRango(movs.rangoLista, rango) ? movs.lista : null;
  const tabla = useMemo(() => (lista ? tablaMovimientos(lista) : null), [lista]);
  const sinPartes = saldos.partes === null;

  const renderCelda = useCallback(
    (celda: Celda, fila: number, columna: number) => {
      if ((columna === COLUMNA_VALOR || columna === COLUMNA_SALDO) && typeof celda === 'number') {
        if (columna === COLUMNA_SALDO) return formatCurrency(celda);
        return (
          <span className={celda < 0 ? 'font-semibold text-lz-danger' : 'font-semibold text-lz-sage-dark'}>
            {valorConSigno(celda)}
          </span>
        );
      }
      if (columna === COLUMNA_ACCION) {
        const m = lista?.[fila];
        if (!m) return '';
        if (m.tipo === 'gasto' && m.gastoEliminado) {
          return <span className="text-sm text-lz-charcoal-muted">Eliminado</span>;
        }
        if (!esGastoEliminable(m)) return '';
        return (
          <button
            type="button"
            onClick={() => {
              setErrorEliminar(null);
              setPorEliminar(m);
            }}
            disabled={eliminando}
            className="min-h-[44px] min-w-[44px] whitespace-nowrap rounded-xl border-2 border-lz-danger-border px-3 text-sm font-semibold text-lz-danger transition-colors hover:bg-lz-danger-surface disabled:opacity-50"
          >
            Eliminar gasto
          </button>
        );
      }
      return celda ?? '';
    },
    [lista, eliminando],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Saldos (Req 8.2) */}
      <section
        aria-label="Saldos de la caja mayor"
        className="flex flex-col gap-4 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col">
            <h3 className="font-lz-display text-base font-semibold text-lz-charcoal">Saldos</h3>
            <p className="text-sm text-lz-charcoal-muted">Saldo actual, sin importar el rango de fechas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => abrir('ajuste')}
              disabled={sinPartes}
              className={claseBotonSecundario}
            >
              Ajuste manual
            </button>
            <button
              type="button"
              onClick={() => abrir('gasto')}
              disabled={sinPartes}
              className={claseBotonPrincipal}
            >
              Registrar gasto / pago grande
            </button>
          </div>
        </div>

        {saldos.error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3">
            <p className="text-sm font-semibold text-lz-danger">{saldos.error}</p>
            <button type="button" onClick={recargarSaldos} disabled={saldos.cargando} className={claseReintentar}>
              {saldos.cargando ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        ) : sinPartes ? (
          <p role="status" aria-live="polite" className="text-sm text-lz-charcoal-muted">
            Cargando saldos…
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibles.map((p) => (
              <div key={p.parteId} className="flex flex-col gap-1 rounded-xl border border-lz-border bg-lz-linen px-4 py-3">
                <span className="text-sm font-medium text-lz-charcoal-muted">
                  {nombreParte(p)}
                  {!p.activo && ' (inactivo)'}
                </span>
                <span className="font-lz-display text-xl font-bold tabular-nums text-lz-charcoal">
                  {formatCurrency(p.saldo)}
                </span>
              </div>
            ))}
            <div className="flex flex-col gap-1 rounded-xl border-2 border-lz-sage bg-lz-sage-light px-4 py-3">
              <span className="text-sm font-semibold text-lz-charcoal">Total</span>
              <span className="font-lz-display text-xl font-bold tabular-nums text-lz-charcoal">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        )}

        {errorParametros && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-lz-charcoal-muted">
              No se pudieron cargar las categorías y personas de caja.
            </p>
            <button type="button" onClick={() => void cargarParametros()} className={claseReintentar}>
              Reintentar
            </button>
          </div>
        )}
      </section>

      {/* Movimientos del rango (Req 8.3) */}
      {movs.error ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-6 text-center"
        >
          <p className="font-lz-display text-base font-bold text-lz-danger">No se pudieron cargar los movimientos</p>
          <p className="text-sm text-lz-charcoal">{movs.error}</p>
          <button
            type="button"
            onClick={() => void cargarMovimientos(rango)}
            disabled={movs.cargando}
            className={claseReintentar}
          >
            {movs.cargando ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      ) : tabla === null ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-3 rounded-2xl border border-lz-border bg-lz-surface px-4 py-12 text-base text-lz-charcoal-muted"
        >
          <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-lz-sage-light border-t-lz-sage" />
          Cargando movimientos…
        </div>
      ) : (
        <TablaReporte tabla={tabla} renderCelda={renderCelda} />
      )}

      {dialogo === 'ajuste' && saldos.partes && (
        <DialogoAjusteMayor
          partes={saldos.partes}
          personas={personas}
          onAjustado={recargarTodo}
          onRecargarSaldos={recargarSaldos}
          onCerrar={cerrarDialogo}
        />
      )}

      {dialogo === 'gasto' && saldos.partes && (
        <DialogoGastoMayor
          partes={saldos.partes}
          categorias={categorias}
          personas={personas}
          onRegistrado={recargarTodo}
          onRecargarSaldos={recargarSaldos}
          onCerrar={cerrarDialogo}
        />
      )}

      {/* Confirmación de eliminación de un Gasto_Sin_Turno (Req 7.4) */}
      {porEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-4 font-lz-sans text-lz-charcoal">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Eliminar gasto"
            className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-lz-surface p-6 shadow-lz-float"
          >
            <h3 className="font-lz-display text-xl font-bold text-lz-charcoal">¿Eliminar este gasto?</h3>
            <p className="text-base text-lz-charcoal">
              {porEliminar.descripcion ?? 'Gasto sin turno'}
            </p>
            <p className="text-sm text-lz-charcoal-muted">
              El dinero vuelve a cada parte de donde salió.
            </p>
            {errorEliminar && (
              <p role="alert" className="text-sm font-semibold text-lz-danger">
                {errorEliminar}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setPorEliminar(null)}
                disabled={eliminando}
                className="min-h-[48px] min-w-[44px] rounded-2xl border-2 border-lz-border px-5 text-base font-semibold text-lz-charcoal hover:bg-lz-sage-light disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void eliminar(porEliminar)}
                disabled={eliminando}
                className="min-h-[48px] min-w-[44px] rounded-2xl bg-lz-danger px-5 text-base font-bold text-lz-surface disabled:opacity-50"
              >
                {eliminando ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SeccionCajaMayor;
