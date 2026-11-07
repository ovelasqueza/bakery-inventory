'use client';

// Gastos/Pedidos del turno: formulario con origen del dinero, advertencia sin cifras, lista con origen,
// total y eliminación (Req 6.1-6.3, 6.7-6.9 de caja-mayor; 8.1-8.8, 17.7, 17.8 de caja-ventas-reportes).

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';
import { SelectorOrigenGasto } from '@/components/caja/SelectorOrigenGasto';
import { SelectorPersona } from '@/components/caja/SelectorPersona';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import { obtenerSaldos, type ParteCajaMayor } from '@/lib/api/cajaMayor';
import { ErrorApp, parteDeError } from '@/lib/api/errores';
import {
  eliminarGasto,
  gastosPorRango,
  registrarGasto,
  type GastoTurno,
  type OrigenGasto,
} from '@/lib/api/gastos';
import type { CategoriaGastoParam, PersonaCajaParam } from '@/lib/api/parametros';
import { resumenTurno } from '@/lib/api/turnos';
import { textoOrigen, validarOrigenes, type ErrorOrigen } from '@/lib/caja/cajaMayor';
import { parteCajon, requiereAdvertencia } from '@/lib/caja/turno';
import { conMiles, validarEnteroEnRango, validarNombrePersona, validarTextoLargo } from '@/lib/caja/validacion';
import { diaLocal, hora12, sumarDias, type Rango } from '@/lib/fechas/bogota';
import { formatCurrency } from '@/lib/utils';

const VALOR_MIN = 1;
const VALOR_MAX = 10_000_000;
const CONCEPTO_MAX = 120;
const MENSAJE_NO_GUARDADO = 'No se guardó. Intente de nuevo.';

type FiltroPeriodoGastos = 'hoy' | 'ayer' | '3d' | '7d' | '15d' | '30d';

const OPCIONES_PERIODO: { id: FiltroPeriodoGastos; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'ayer', etiqueta: 'Ayer' },
  { id: '3d', etiqueta: '3 días' },
  { id: '7d', etiqueta: '7 días' },
  { id: '15d', etiqueta: '15 días' },
  { id: '30d', etiqueta: '1 mes' },
];

function rangoDeFiltro(filtro: FiltroPeriodoGastos, ahora: Date = new Date()): Rango {
  const hoy = diaLocal(ahora);
  switch (filtro) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case 'ayer': {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case '3d':
      return { desde: sumarDias(hoy, -2), hasta: hoy };
    case '7d':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case '15d':
      return { desde: sumarDias(hoy, -14), hasta: hoy };
    case '30d':
      return { desde: sumarDias(hoy, -29), hasta: hoy };
  }
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

function etiquetaDia(diaIso: string, ahora: Date = new Date()): string {
  const hoy = diaLocal(ahora);
  const ayer = sumarDias(hoy, -1);
  const partes = diaIso.split('-');
  if (partes.length !== 3) return diaIso;
  const [y, m, d] = partes.map(Number);
  const fechaUtc = new Date(Date.UTC(y, m - 1, d));
  const nombreDia = DIAS_SEMANA[fechaUtc.getUTCDay()] ?? '';
  const corta = `${partes[2]}/${partes[1]}/${partes[0]}`;
  if (diaIso === hoy) return `Hoy · ${nombreDia} ${corta}`;
  if (diaIso === ayer) return `Ayer · ${nombreDia} ${corta}`;
  return `${nombreDia} ${corta}`;
}

interface GrupoDiaGastos {
  dia: string;
  etiqueta: string;
  totalDia: number;
  items: GastoTurno[];
}

interface PanelGastosProps {
  turnoId: string;
  /** Categorías de gasto activas. */
  categorias: CategoriaGastoParam[];
  personas: PersonaCajaParam[];
  /** Se registró o eliminó un gasto: el efectivo esperado cambió. */
  onCambio: () => void;
  /** El turno ya estaba cerrado: hay que mostrar la apertura (Req 8.8). */
  onTurnoCerrado: () => void;
  onCerrar: () => void;
}

interface ErroresForm {
  valor?: string;
  concepto?: string;
  categoria?: string;
  persona?: string;
  origen?: string;
}

interface GastoValido {
  valor: number;
  concepto: string;
  categoriaId: string;
  persona: string;
  origenes: OrigenGasto[];
}

/** Operación que falló sin conexión; "Reintentar" la repite. */
type FalloConexion =
  | { tipo: 'lista' }
  | { tipo: 'registrar'; gasto: GastoValido; confirmado: boolean; clave: string }
  | { tipo: 'eliminar'; gastoId: string };

function codigoDe(e: unknown): string {
  return e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
}

function mensajeValor(error: 'VACIO' | 'NO_ENTERO' | 'RANGO'): string {
  if (error === 'VACIO') return 'Escriba el valor del gasto.';
  if (error === 'NO_ENTERO') return 'Escriba solo números enteros, sin comas ni decimales.';
  return `El valor debe estar entre ${formatCurrency(VALOR_MIN)} y ${formatCurrency(VALOR_MAX)}.`;
}

const MENSAJE_ORIGEN_INVALIDO = 'Revise de dónde sale el dinero: los valores deben sumar el total.';

function mensajeOrigen(error: ErrorOrigen): string {
  if (error === 'SUMA_DISTINTA') return 'Los valores de cada fuente deben sumar el valor del gasto.';
  if (error === 'VALOR_INVALIDO') return 'Escriba en cada fuente un número entero mayor que 0, o déjela vacía.';
  if (error === 'VACIO') return 'Escoja de dónde sale el dinero.';
  return 'Escoja otra vez de dónde sale el dinero.';
}

function mensajeSaldo(e: ErrorApp): string {
  const parte = parteDeError(e);
  return parte ? `No alcanza el saldo de ${parte} en caja mayor.` : 'No alcanza el saldo en caja mayor.';
}

export function PanelGastos({
  turnoId,
  categorias,
  personas,
  onCambio,
  onTurnoCerrado,
  onCerrar,
}: PanelGastosProps) {
  const { showToast } = useToast();
  const idValor = useId();
  const idConcepto = useId();
  const idTitulo = useId();

  const [valor, setValor] = useState('');
  const [concepto, setConcepto] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [persona, setPersona] = useState('');
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [advertencia, setAdvertencia] = useState<{ gasto: GastoValido } | null>(null);

  // Origen del dinero. La `key` del selector se renueva para volver a Cajón tras registrar.
  const [origenes, setOrigenes] = useState<OrigenGasto[]>([]);
  const [claveSelector, setClaveSelector] = useState(0);
  const [partes, setPartes] = useState<ParteCajaMayor[]>([]);
  const [errorSaldos, setErrorSaldos] = useState(false);

  const [gastos, setGastos] = useState<GastoTurno[]>([]);
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodoGastos>('hoy');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [porEliminar, setPorEliminar] = useState<GastoTurno | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const [falloConexion, setFalloConexion] = useState<FalloConexion | null>(null);

  const activas = categorias.filter((c) => c.activo);
  const nombresPartes = useMemo(
    () => new Map(partes.map((p) => [p.parteId, p.metodoPagoId === null ? 'Caja mayor Efectivo' : p.nombre])),
    [partes]
  );
  const valorNumerico = useMemo(() => {
    const v = validarEnteroEnRango(valor, VALOR_MIN, VALOR_MAX);
    return v.ok ? v.valor : null;
  }, [valor]);

  // La clave cambia solo si cambian los datos; un reintento del mismo gasto la reutiliza (Req 17.8).
  const firma = JSON.stringify([turnoId, valor.trim(), concepto.trim(), categoriaId, persona.trim(), origenes]);
  const { clave, renovar } = useClaveIdempotente(firma);

  const cargarSaldos = useCallback(async () => {
    try {
      setPartes(await obtenerSaldos());
      setErrorSaldos(false);
    } catch {
      // Sin saldos se puede seguir registrando desde el Cajón.
      setErrorSaldos(true);
    }
  }, []);

  useEffect(() => {
    void cargarSaldos();
  }, [cargarSaldos]);

  const turnoCerrado = useCallback(() => {
    showToast('El turno ya fue cerrado', 'warning');
    onTurnoCerrado();
  }, [onTurnoCerrado, showToast]);

  const cargarGastos = useCallback(async () => {
    setCargando(true);
    setErrorLista(null);
    try {
      const lista = await gastosPorRango(rangoDeFiltro(filtroPeriodo));
      // Más reciente primero (Req 8.6).
      lista.sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn));
      setGastos(lista);
      setFalloConexion((f) => (f?.tipo === 'lista' ? null : f));
    } catch (e) {
      const codigo = codigoDe(e);
      if (codigo === 'TURNO_CERRADO') turnoCerrado();
      else if (codigo === 'SIN_CONEXION') setFalloConexion({ tipo: 'lista' });
      else setErrorLista('No se pudieron cargar los gastos.');
    } finally {
      setCargando(false);
    }
  }, [filtroPeriodo, turnoCerrado]);

  useEffect(() => {
    void cargarGastos();
  }, [cargarGastos]);

  function validar(): GastoValido | null {
    const nuevos: ErroresForm = {};
    const v = validarEnteroEnRango(valor, VALOR_MIN, VALOR_MAX);
    if (!v.ok) nuevos.valor = mensajeValor(v.error);
    const c = validarTextoLargo(concepto, 1, CONCEPTO_MAX);
    if (!c.ok) {
      nuevos.concepto = c.error === 'CORTO' ? 'Escriba el concepto.' : `Máximo ${CONCEPTO_MAX} caracteres.`;
    }
    if (!activas.some((cat) => cat.id === categoriaId)) nuevos.categoria = 'Escoja una categoría.';
    const p = validarNombrePersona(persona);
    if (!p.ok) nuevos.persona = p.error === 'VACIO' ? 'Escoja o escriba quién registra.' : 'Máximo 60 caracteres.';
    let origenValido = false;
    if (v.ok) {
      const o = validarOrigenes(v.valor, origenes, {
        conTurno: true,
        partes: new Set(partes.map((x) => x.parteId)),
      });
      if (o.ok) origenValido = true;
      else nuevos.origen = mensajeOrigen(o.error);
    }

    setErrores(nuevos);
    if (!v.ok || !c.ok || !p.ok || nuevos.categoria || !origenValido) return null;
    return { valor: v.valor, concepto: c.valor, categoriaId, persona: p.valor, origenes };
  }

  /** Registra el gasto; si no está confirmado y sale algo del cajón, antes revisa el efectivo (Req 6.7). */
  async function enviar(gasto: GastoValido, confirmado: boolean, claveUsada: string = clave) {
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const delCajon = parteCajon({ valor: gasto.valor, eliminado: false, origenes: gasto.origenes });
      if (!confirmado && delCajon > 0) {
        const resumen = await resumenTurno(turnoId);
        // Aviso sin cifras: no se muestra el efectivo esperado (cierre a ciegas).
        if (requiereAdvertencia(delCajon, resumen.efectivoEsperado)) {
          setAdvertencia({ gasto });
          setFalloConexion(null);
          return;
        }
      }
      await registrarGasto({ clave: claveUsada, turnoId, ...gasto });
      showToast('Gasto registrado', 'success');
      setValor('');
      setConcepto('');
      setCategoriaId('');
      setPersona('');
      setOrigenes([]);
      setClaveSelector((k) => k + 1);
      setErrores({});
      setFalloConexion(null);
      renovar();
      onCambio();
      void cargarGastos();
      if (gasto.origenes.some((o) => o.parteId !== null)) void cargarSaldos();
    } catch (e) {
      const codigo = codigoDe(e);
      if (codigo === 'TURNO_CERRADO' || codigo === 'TURNO_NO_ABIERTO') turnoCerrado();
      else if (codigo === 'SIN_CONEXION') setFalloConexion({ tipo: 'registrar', gasto, confirmado, clave: claveUsada });
      else if (codigo === 'SALDO_INSUFICIENTE' && e instanceof ErrorApp) {
        setErrores((prev) => ({ ...prev, origen: mensajeSaldo(e) }));
        void cargarSaldos();
      } else if (codigo === 'ORIGEN_INVALIDO') {
        setErrores((prev) => ({ ...prev, origen: MENSAJE_ORIGEN_INVALIDO }));
        void cargarSaldos();
      } else setErrorGuardar(MENSAJE_NO_GUARDADO);
    } finally {
      setGuardando(false);
    }
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const gasto = validar();
    if (gasto) void enviar(gasto, false);
  }

  function confirmarAdvertencia() {
    if (!advertencia) return;
    const { gasto } = advertencia;
    setAdvertencia(null);
    void enviar(gasto, true);
  }

  async function eliminar(gastoId: string) {
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await eliminarGasto(gastoId);
      setPorEliminar(null);
      setFalloConexion(null);
      showToast('Gasto eliminado', 'success');
      onCambio();
      void cargarGastos();
      void cargarSaldos();
    } catch (e) {
      const codigo = codigoDe(e);
      if (codigo === 'TURNO_CERRADO' || codigo === 'TURNO_NO_ABIERTO') {
        setPorEliminar(null);
        turnoCerrado();
      } else if (codigo === 'SIN_CONEXION') {
        setPorEliminar(null);
        setFalloConexion({ tipo: 'eliminar', gastoId });
      } else {
        setErrorEliminar(MENSAJE_NO_GUARDADO);
      }
    } finally {
      setEliminando(false);
    }
  }

  function reintentar() {
    const f = falloConexion;
    if (!f) return;
    if (f.tipo === 'lista') void cargarGastos();
    else if (f.tipo === 'registrar') void enviar(f.gasto, f.confirmado, f.clave);
    else void eliminar(f.gastoId);
  }

  const gastosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return gastos;
    return gastos.filter(
      (g) =>
        g.concepto.toLowerCase().includes(q) ||
        g.categoriaNombre.toLowerCase().includes(q) ||
        g.registradoPor.toLowerCase().includes(q)
    );
  }, [gastos, busqueda]);

  const gruposPorDia = useMemo<GrupoDiaGastos[]>(() => {
    const mapa = new Map<string, GrupoDiaGastos>();
    const ahora = new Date();
    for (const g of gastosFiltrados) {
      const dia = diaLocal(g.creadoEn);
      let grupo = mapa.get(dia);
      if (!grupo) {
        grupo = {
          dia,
          etiqueta: etiquetaDia(dia, ahora),
          totalDia: 0,
          items: [],
        };
        mapa.set(dia, grupo);
      }
      grupo.totalDia += g.valor;
      grupo.items.push(g);
    }
    return Array.from(mapa.values()).sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
  }, [gastosFiltrados]);

  const total = gastosFiltrados.reduce((s, g) => s + g.valor, 0);
  const ocupado = guardando || eliminando;

  // Esc cierra primero la confirmación abierta y luego la ventana.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || guardando || eliminando) return;
      if (advertencia) setAdvertencia(null);
      else if (porEliminar) setPorEliminar(null);
      else onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [advertencia, porEliminar, guardando, eliminando, onCerrar]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-lz-charcoal/50 p-3 font-lz-sans text-lz-charcoal sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      onClick={(e) => {
        if (e.target === e.currentTarget && !ocupado) onCerrar();
      }}
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-lz-linen shadow-lz-float">
      <header className="flex items-center justify-between gap-3 border-b border-lz-border bg-lz-surface px-5 py-3">
        <h2 id={idTitulo} className="font-lz-display text-xl font-bold text-lz-charcoal">
          Gastos/Pedidos del turno
        </h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-lz-charcoal-muted transition-colors hover:bg-lz-oat"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* Formulario */}
        <form
          onSubmit={alEnviar}
          noValidate
          className="flex flex-col gap-4 rounded-3xl border border-lz-border bg-lz-surface p-5 shadow-lz-card"
        >
          <h3 className="font-lz-display text-lg font-bold text-lz-charcoal">Registrar gasto</h3>

          {falloConexion && falloConexion.tipo !== 'lista' && (
            <AvisoSinConexion onReintentar={reintentar} reintentando={ocupado} />
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor={idValor} className="text-sm font-medium text-lz-charcoal-muted">
              Valor (COP)
            </label>
            <input
              id={idValor}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={valor}
              onChange={(e) => setValor(conMiles(e.target.value))}
              aria-invalid={errores.valor ? true : undefined}
              aria-describedby={errores.valor ? `${idValor}-error` : undefined}
              className={`min-h-[52px] w-full rounded-2xl border-2 bg-lz-surface px-4 text-xl font-semibold tabular-nums text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
                errores.valor ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
              }`}
            />
            {errores.valor && (
              <p id={`${idValor}-error`} role="alert" className="text-sm font-medium text-lz-danger">
                {errores.valor}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={idConcepto} className="text-sm font-medium text-lz-charcoal-muted">
              Concepto
            </label>
            <input
              id={idConcepto}
              type="text"
              autoComplete="off"
              value={concepto}
              maxLength={CONCEPTO_MAX + 20}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej: Harina, gas, domicilio"
              aria-invalid={errores.concepto ? true : undefined}
              aria-describedby={errores.concepto ? `${idConcepto}-error` : undefined}
              className={`min-h-[48px] w-full rounded-2xl border-2 bg-lz-surface px-4 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
                errores.concepto ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
              }`}
            />
            {errores.concepto && (
              <p id={`${idConcepto}-error`} role="alert" className="text-sm font-medium text-lz-danger">
                {errores.concepto}
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-lz-charcoal-muted">Categoría</legend>
            {activas.length === 0 ? (
              <p className="text-sm text-lz-charcoal-muted">No hay categorías de gasto activas.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Categorías de gasto">
                {activas.map((c) => {
                  const elegida = c.id === categoriaId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={elegida}
                      onClick={() => setCategoriaId(c.id)}
                      className={`min-h-[48px] min-w-[44px] rounded-2xl border-2 px-4 text-base font-semibold transition-colors ${
                        elegida
                          ? 'border-lz-sage bg-lz-sage text-lz-surface'
                          : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
                      }`}
                    >
                      {c.nombre}
                    </button>
                  );
                })}
              </div>
            )}
            {errores.categoria && (
              <p role="alert" className="text-sm font-medium text-lz-danger">
                {errores.categoria}
              </p>
            )}
          </fieldset>

          <SelectorOrigenGasto
            key={claveSelector}
            valor={valorNumerico}
            partes={partes}
            permitirCajon
            value={origenes}
            onChange={(o) => {
              setOrigenes(o);
              setErrores((prev) => (prev.origen ? { ...prev, origen: undefined } : prev));
            }}
            error={errores.origen}
            deshabilitado={guardando}
          />
          {errorSaldos && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-lz-charcoal-muted">
                No se pudieron cargar los saldos de caja mayor. Puede registrar desde el Cajón.
              </p>
              <button
                type="button"
                onClick={() => void cargarSaldos()}
                className="min-h-[44px] min-w-[44px] rounded-xl border-2 border-lz-border px-4 text-sm font-semibold text-lz-charcoal hover:bg-lz-sage-light"
              >
                Reintentar
              </button>
            </div>
          )}

          <SelectorPersona
            personas={personas}
            value={persona}
            onChange={setPersona}
            error={errores.persona}
            etiqueta="¿Quién registra el gasto?"
          />

          {errorGuardar && (
            <p role="alert" className="rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3 text-sm font-semibold text-lz-danger">
              {errorGuardar}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="min-h-[56px] rounded-2xl bg-lz-sage px-6 font-lz-display text-lg font-bold text-lz-surface shadow-lz-float transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Registrar gasto'}
          </button>
        </form>

        {/* Lista */}
        <section
          aria-label="Gastos registrados"
          className="flex flex-col rounded-3xl border border-lz-border bg-lz-surface shadow-lz-card"
        >
          <div className="flex flex-col gap-3 border-b border-lz-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-lz-display text-lg font-bold text-lz-charcoal">Gastos registrados</h3>
                <p className="text-xs font-medium text-lz-charcoal-muted">
                  {`${gastosFiltrados.length} gastos en ${gruposPorDia.length} ${gruposPorDia.length === 1 ? 'día' : 'días'}`}
                </p>
              </div>
              <p className="text-right">
                <span className="block text-xs font-medium uppercase tracking-wide text-lz-charcoal-muted">
                  Total general
                </span>
                <span className="font-lz-display text-2xl font-bold tabular-nums text-lz-charcoal">
                  {formatCurrency(total)}
                </span>
              </p>
            </div>

            {/* Atajos de días anteriores hasta 1 mes (todos los turnos) */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar gastos por período">
              {OPCIONES_PERIODO.map((op) => {
                const activo = filtroPeriodo === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setFiltroPeriodo(op.id)}
                    className={`min-h-[38px] rounded-xl border px-3 py-1 text-sm font-semibold transition-colors ${
                      activo
                        ? 'border-lz-sage bg-lz-sage text-lz-surface'
                        : 'border-lz-border bg-lz-linen text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
                    }`}
                  >
                    {op.etiqueta}
                  </button>
                );
              })}
            </div>

            {gastos.length > 0 && (
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por concepto, categoría o persona…"
                className="min-h-[42px] w-full rounded-xl border border-lz-border bg-lz-linen px-3.5 text-sm text-lz-charcoal placeholder:text-lz-charcoal-muted focus:border-lz-sage focus:bg-lz-surface focus:outline-none"
              />
            )}
          </div>

          {falloConexion?.tipo === 'lista' && (
            <div className="px-5 pt-4">
              <AvisoSinConexion onReintentar={reintentar} reintentando={cargando} />
            </div>
          )}
          {errorLista && (
            <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
              <p role="alert" className="text-sm font-semibold text-lz-danger">
                {errorLista}
              </p>
              <button
                type="button"
                onClick={() => void cargarGastos()}
                className="min-h-[44px] min-w-[44px] rounded-xl border-2 border-lz-border px-4 text-sm font-semibold text-lz-charcoal hover:bg-lz-sage-light"
              >
                Reintentar
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cargando && gastos.length === 0 ? (
              <p className="px-5 py-6 text-base text-lz-charcoal-muted">Cargando gastos…</p>
            ) : gastosFiltrados.length === 0 ? (
              <p className="px-5 py-6 text-base text-lz-charcoal-muted">
                {busqueda.trim()
                  ? 'No se encontraron gastos con esa búsqueda.'
                  : 'No hay gastos registrados en este período.'}
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-lz-border">
                {gruposPorDia.map((grupo) => (
                  <div key={grupo.dia} className="flex flex-col">
                    {/* Encabezado de cada día con su Total del día */}
                    <div className="flex items-center justify-between gap-3 bg-lz-linen px-5 py-2.5 border-b border-lz-border">
                      <div className="flex items-center gap-2">
                        <span className="font-lz-display text-sm font-bold text-lz-charcoal">
                          {grupo.etiqueta}
                        </span>
                        <span className="rounded-full bg-lz-surface px-2 py-0.5 text-xs font-semibold text-lz-charcoal-muted border border-lz-border">
                          {grupo.items.length} {grupo.items.length === 1 ? 'gasto' : 'gastos'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-lz-charcoal-muted">
                          Total día:
                        </span>
                        <span className="font-lz-display text-base font-bold tabular-nums text-lz-sage-dark">
                          {formatCurrency(grupo.totalDia)}
                        </span>
                      </div>
                    </div>

                    <ul className="divide-y divide-lz-border">
                      {grupo.items.map((g) => {
                        const esDeEsteTurno = g.turnoId === turnoId && !g.esDeTurnoCerrado;
                        return (
                          <li key={g.id} className="flex items-center gap-3 px-5 py-3">
                            <span className="w-[4.75rem] shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-lz-charcoal-muted">
                              {hora12(g.creadoEn)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="break-words text-base font-semibold text-lz-charcoal">{g.concepto}</p>
                                {g.registradoPor && (
                                  <span className="inline-flex items-center rounded-lg border border-lz-border bg-lz-linen px-2 py-0.5 text-xs font-bold text-lz-charcoal">
                                    Registró: {g.registradoPor}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-lz-charcoal-muted">
                                {g.categoriaNombre} · {textoOrigen(g.origenes, nombresPartes, formatCurrency)}
                              </p>
                            </div>
                            <span className="shrink-0 font-lz-display text-lg font-bold tabular-nums text-lz-charcoal">
                              {formatCurrency(g.valor)}
                            </span>
                            {esDeEsteTurno && (
                              <button
                                type="button"
                                onClick={() => {
                                  setErrorEliminar(null);
                                  setPorEliminar(g);
                                }}
                                disabled={ocupado}
                                aria-label={`Eliminar gasto ${g.concepto}`}
                                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border-2 border-lz-danger-border text-lz-danger transition-colors hover:bg-lz-danger-surface disabled:opacity-50"
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 24 24"
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                                </svg>
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}

                {gruposPorDia.length > 1 && (
                  <div className="flex items-center justify-between gap-3 bg-lz-sage-light/60 px-5 py-3.5">
                    <span className="font-lz-display text-base font-bold text-lz-charcoal">
                      Total general ({gruposPorDia.length} días · {gastosFiltrados.length} gastos)
                    </span>
                    <span className="font-lz-display text-xl font-bold tabular-nums text-lz-charcoal">
                      {formatCurrency(total)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      </div>

      {/* Advertencia sin cifras: la parte del cajón podría superar el efectivo (Req 6.7, cierre a ciegas) */}
      {advertencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="El cajón podría no tener suficiente efectivo"
            className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-lz-surface p-6 shadow-lz-float"
          >
            <h3 className="font-lz-display text-xl font-bold text-lz-charcoal">Confirmar gasto</h3>
            <p className="text-base text-lz-charcoal">
              El cajón podría no tener suficiente efectivo. ¿Registrar de todas formas?
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setAdvertencia(null)}
                className="min-h-[48px] min-w-[44px] rounded-2xl border-2 border-lz-border px-5 text-base font-semibold text-lz-charcoal hover:bg-lz-sage-light"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAdvertencia}
                className="min-h-[48px] min-w-[44px] rounded-2xl bg-lz-amber px-5 text-base font-bold text-lz-surface hover:bg-lz-amber-warm"
              >
                Registrar igual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de eliminación (Req 8.5) */}
      {porEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Eliminar gasto"
            className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-lz-surface p-6 shadow-lz-float"
          >
            <h3 className="font-lz-display text-xl font-bold text-lz-charcoal">¿Eliminar este gasto?</h3>
            <p className="text-base text-lz-charcoal">
              {porEliminar.concepto} · {porEliminar.categoriaNombre} ·{' '}
              <span className="font-bold tabular-nums">{formatCurrency(porEliminar.valor)}</span>
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
                onClick={() => void eliminar(porEliminar.id)}
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

export default PanelGastos;
