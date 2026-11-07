'use client';

// Lista de Gastos del rango, total por Categoria_Gasto (Req 12.5) y registro de gastos olvidados en turnos cerrados (solo Admin).

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  eliminarGasto,
  listarTurnosCerradosRecientes,
  obtenerGastosTurnosCerradosActivos,
  registrarGastoTurnoCerrado,
  type GastoTurnoCerradoRespaldo,
  type TurnoCerradoResumen,
} from '@/lib/api/gastos';
import {
  obtenerParametrosCaja,
  type CategoriaGastoParam,
  type PersonaCajaParam,
} from '@/lib/api/parametros';
import { conMiles, validarEnteroEnRango, validarNombrePersona, validarTextoLargo } from '@/lib/caja/validacion';
import { diaLocal, hora12 } from '@/lib/fechas/bogota';
import type { Reporte } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { formatCurrency } from '@/lib/utils';
import { EstadoVacioReporte } from './EstadoVacioReporte';
import { TablaReporte } from './TablaReporte';

const VALOR_MIN = 1;
const VALOR_MAX = 10_000_000;
const CONCEPTO_MAX = 120;

interface SeccionGastosProps {
  reporte: Reporte;
  onCambio?: () => void;
}

function nuevoUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gasto-admin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const NOMBRES_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatearFechaCorta(ymd: string): string {
  const [a, m, d] = ymd.split('-').map(Number);
  if (!a || !m || !d) return ymd;
  return `${d} ${NOMBRES_MESES[m - 1] ?? ''} ${a}`;
}

export function SeccionGastos({ reporte, onCambio }: SeccionGastosProps) {
  const idBase = useId();
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'gastos', 'pantalla'), [reporte]);

  const [abiertoForm, setAbiertoForm] = useState(false);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);
  const [turnosCerrados, setTurnosCerrados] = useState<TurnoCerradoResumen[]>([]);
  const [categorias, setCategorias] = useState<CategoriaGastoParam[]>([]);
  const [personas, setPersonas] = useState<PersonaCajaParam[]>([]);
  const [gastosCerradosActivos, setGastosCerradosActivos] = useState<GastoTurnoCerradoRespaldo[]>([]);

  const [turnoCerradoId, setTurnoCerradoId] = useState('');
  const [textoValor, setTextoValor] = useState('');
  const [concepto, setConcepto] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [persona, setPersona] = useState('');
  const [claveIdempotencia, setClaveIdempotencia] = useState<string>(() => nuevoUuid());

  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exitoMsg, setExitoMsg] = useState<string | null>(null);

  const cargarDatosAdmin = useCallback(async () => {
    setCargandoCatalogos(true);
    try {
      const [turnos, params, cerradosActivos] = await Promise.all([
        listarTurnosCerradosRecientes(20),
        obtenerParametrosCaja(),
        obtenerGastosTurnosCerradosActivos(),
      ]);
      setTurnosCerrados(turnos);
      setCategorias(params.categoriasGasto);
      setPersonas(params.personas);
      setGastosCerradosActivos(cerradosActivos);
      setTurnoCerradoId((actual) => (actual && turnos.some((t: TurnoCerradoResumen) => t.id === actual) ? actual : (turnos[0]?.id ?? '')));
    } catch {
      setErrorMsg('No se pudieron cargar los turnos cerrados o catálogos.');
    } finally {
      setCargandoCatalogos(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatosAdmin();
  }, [cargarDatosAdmin]);

  const valorResultado = validarEnteroEnRango(textoValor, VALOR_MIN, VALOR_MAX);
  const conceptoResultado = validarTextoLargo(concepto, 1, CONCEPTO_MAX);
  const personaResultado = validarNombrePersona(persona);
  const categoriaValida = categorias.some((c) => c.id === categoriaId);
  const turnoValido = turnosCerrados.some((t) => t.id === turnoCerradoId);

  const valorValido = valorResultado.ok;
  const conceptoValido = conceptoResultado.ok;
  const personaValida = personaResultado.ok;

  const formularioValido =
    valorValido && conceptoValido && categoriaValida && personaValida && turnoValido;

  async function manejarRegistrar(e: React.FormEvent) {
    e.preventDefault();
    setIntentoEnvio(true);
    setErrorMsg(null);
    setExitoMsg(null);
    if (
      !valorResultado.ok ||
      !conceptoResultado.ok ||
      !personaResultado.ok ||
      !categoriaValida ||
      !turnoValido ||
      guardando
    ) {
      return;
    }

    const turnoElegido = turnosCerrados.find((t) => t.id === turnoCerradoId);
    const catElegida = categorias.find((c) => c.id === categoriaId);
    if (!turnoElegido || !catElegida) return;

    setGuardando(true);
    try {
      await registrarGastoTurnoCerrado({
        clave: claveIdempotencia,
        turnoId: turnoElegido.id,
        cerradoEn: turnoElegido.cerradoEn,
        valor: valorResultado.valor,
        concepto: conceptoResultado.valor,
        categoriaId: catElegida.id,
        categoriaNombre: catElegida.nombre,
        persona: personaResultado.valor,
      });
      setTextoValor('');
      setConcepto('');
      setIntentoEnvio(false);
      setClaveIdempotencia(nuevoUuid());
      setExitoMsg('Gasto registrado en el turno cerrado y descontado de su cuadre de efectivo.');
      await cargarDatosAdmin();
      onCambio?.();
    } catch {
      setErrorMsg('No se pudo guardar el gasto en el turno cerrado. Intente de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  async function manejarEliminarGastoCerrado(id: string) {
    if (eliminandoId !== null) return;
    setEliminandoId(id);
    setErrorMsg(null);
    setExitoMsg(null);
    try {
      await eliminarGasto(id);
      await cargarDatosAdmin();
      onCambio?.();
    } catch {
      setErrorMsg('No se pudo eliminar el gasto.');
    } finally {
      setEliminandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Panel exclusivo de Admin para registrar gastos olvidados en turnos cerrados */}
      <section className="rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-lz-display text-base font-bold text-lz-charcoal">
              ¿Olvidaron registrar un gasto en un turno ya cerrado?
            </h3>
            <p className="text-xs text-lz-charcoal-muted">
              Regístrelo aquí para asignarlo a ese turno cerrado y descontarlo automáticamente del efectivo esperado de su cierre.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAbiertoForm((v) => !v);
              setErrorMsg(null);
              setExitoMsg(null);
            }}
            className={`min-h-[42px] rounded-xl px-4 text-sm font-semibold transition-colors ${
              abiertoForm
                ? 'border border-lz-border bg-lz-linen text-lz-charcoal hover:bg-lz-sage-light'
                : 'bg-lz-sage text-lz-surface hover:bg-lz-sage-dark'
            }`}
          >
            {abiertoForm ? 'Cerrar formulario' : '+ Registrar gasto en turno cerrado'}
          </button>
        </div>

        {exitoMsg && (
          <div
            role="status"
            className="mt-3 rounded-xl border border-lz-sage bg-lz-sage-light px-3 py-2 text-sm font-medium text-lz-sage-dark"
          >
            {exitoMsg}
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-medium text-lz-danger"
          >
            {errorMsg}
          </div>
        )}

        {abiertoForm && (
          <form onSubmit={manejarRegistrar} noValidate className="mt-4 flex flex-col gap-4 border-t border-lz-border pt-4">
            {cargandoCatalogos ? (
              <p className="text-sm text-lz-charcoal-muted">Cargando turnos cerrados…</p>
            ) : turnosCerrados.length === 0 ? (
              <p className="text-sm text-lz-charcoal-muted">No hay turnos cerrados recientes.</p>
            ) : (
              <>
                <div>
                  <label
                    htmlFor={`${idBase}-turno`}
                    className="mb-1.5 block text-sm font-semibold text-lz-charcoal"
                  >
                    Seleccione el turno cerrado
                  </label>
                  <select
                    id={`${idBase}-turno`}
                    value={turnoCerradoId}
                    onChange={(e) => setTurnoCerradoId(e.target.value)}
                    disabled={guardando}
                    className="min-h-[44px] w-full rounded-xl border border-lz-border bg-lz-surface px-3 py-2 text-sm font-medium text-lz-charcoal focus:border-lz-sage focus:outline-none"
                  >
                    {turnosCerrados.map((t) => {
                      const fecha = formatearFechaCorta(diaLocal(t.cerradoEn));
                      const hIni = hora12(t.abiertoEn);
                      const hFin = hora12(t.cerradoEn);
                      return (
                        <option key={t.id} value={t.id}>
                          {fecha} · {hIni} a {hFin} · Abrió: {t.abiertoPor} / Cerró: {t.cerradoPor || t.abiertoPor}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`${idBase}-valor`}
                      className="mb-1 block text-sm font-medium text-lz-charcoal"
                    >
                      Valor (COP)
                    </label>
                    <input
                      id={`${idBase}-valor`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="$ 0"
                      value={textoValor}
                      onChange={(e) => setTextoValor(conMiles(e.target.value))}
                      disabled={guardando}
                      className="min-h-[44px] w-full rounded-xl border border-lz-border bg-lz-surface px-3.5 py-2 font-lz-mono text-base font-semibold text-lz-charcoal focus:border-lz-sage focus:outline-none"
                    />
                    {intentoEnvio && !valorValido && (
                      <p className="mt-1 text-xs text-lz-danger">Ingrese un valor mayor a cero.</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor={`${idBase}-concepto`}
                      className="mb-1 block text-sm font-medium text-lz-charcoal"
                    >
                      Concepto
                    </label>
                    <input
                      id={`${idBase}-concepto`}
                      type="text"
                      maxLength={200}
                      placeholder="Ej. Pago de proveedor, hielo, bolsas…"
                      value={concepto}
                      onChange={(e) => setConcepto(e.target.value)}
                      disabled={guardando}
                      className="min-h-[44px] w-full rounded-xl border border-lz-border bg-lz-surface px-3.5 py-2 text-sm text-lz-charcoal focus:border-lz-sage focus:outline-none"
                    />
                    {intentoEnvio && !conceptoValido && (
                      <p className="mt-1 text-xs text-lz-danger">Escriba el concepto del gasto.</p>
                    )}
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-medium text-lz-charcoal">Categoría</span>
                  <div className="flex flex-wrap gap-2">
                    {categorias.map((c) => {
                      const activa = c.id === categoriaId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategoriaId(c.id)}
                          disabled={guardando}
                          aria-pressed={activa}
                          className={`min-h-[40px] rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                            activa
                              ? 'border-lz-sage bg-lz-sage text-lz-surface'
                              : 'border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-linen'
                          }`}
                        >
                          {c.nombre}
                        </button>
                      );
                    })}
                  </div>
                  {intentoEnvio && !categoriaValida && (
                    <p className="mt-1 text-xs text-lz-danger">Seleccione una categoría.</p>
                  )}
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-medium text-lz-charcoal">
                    ¿Quién realizó o registró el gasto?
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {personas.map((p) => {
                      const activa = p.nombre === persona;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPersona(p.nombre)}
                          disabled={guardando}
                          aria-pressed={activa}
                          className={`min-h-[40px] rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                            activa
                              ? 'border-lz-sage bg-lz-sage text-lz-surface'
                              : 'border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-linen'
                          }`}
                        >
                          {p.nombre}
                        </button>
                      );
                    })}
                  </div>
                  {intentoEnvio && !personaValida && (
                    <p className="mt-1 text-xs text-lz-danger">Seleccione quién registró el gasto.</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={guardando}
                    className="min-h-[44px] rounded-xl bg-lz-sage px-5 py-2.5 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark disabled:opacity-60"
                  >
                    {guardando ? 'Guardando…' : 'Guardar gasto en turno cerrado'}
                  </button>
                </div>
              </>
            )}
          </form>
        )}

        {gastosCerradosActivos.length > 0 && (
          <div className="mt-4 border-t border-lz-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-lz-charcoal-muted">
              Gastos agregados a turnos cerrados ({gastosCerradosActivos.length})
            </p>
            <ul className="divide-y divide-lz-border rounded-xl border border-lz-border bg-lz-linen/50">
              {gastosCerradosActivos.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-lz-charcoal">{g.concepto}</span>
                    <span className="ml-2 text-xs text-lz-charcoal-muted">
                      ({g.categoriaNombre} · Registró: {g.registradoPor} · {formatearFechaCorta(diaLocal(g.creadoEn))}{' '}
                      {hora12(g.creadoEn)})
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-lz-mono font-bold text-lz-charcoal">{formatCurrency(g.valor)}</span>
                    <button
                      type="button"
                      onClick={() => void manejarEliminarGastoCerrado(g.id)}
                      disabled={eliminandoId !== null}
                      className="min-h-[34px] rounded-lg border border-lz-danger-border bg-lz-danger-surface px-2.5 py-1 text-xs font-semibold text-lz-danger hover:opacity-90 disabled:opacity-50"
                    >
                      {eliminandoId === g.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {reporte.gastos.length === 0 ? (
        <EstadoVacioReporte />
      ) : (
        tablas.map((t) => <TablaReporte key={t.titulo} tabla={t} />)
      )}
    </div>
  );
}

export default SeccionGastos;
