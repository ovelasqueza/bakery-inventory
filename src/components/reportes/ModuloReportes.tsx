'use client';

/**
 * Modulo_Reportes: encabezado, pestañas, filtro de rango y la sección visible.
 * Abre en Resumen con el rango Hoy, conserva el rango al cambiar de sección,
 * descarta respuestas viejas y no muestra cifras de otro rango tras un error.
 *
 * Requisitos: 11.2, 11.3, 11.5, 11.6, 11.7, 12.10, 12.11, 12.13, 13.1, 15.2, 16.4
 * (barra-acciones-caja: 12.1, 12.6)
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LogoLizpan } from '@/components/marca/LogoLizpan';
import { obtenerReporte } from '@/lib/api/reportes';
import { ErrorApp } from '@/lib/api/errores';
import { atajoRango, type Rango } from '@/lib/fechas/bogota';
import { construirReporte, type Reporte } from '@/lib/reportes/agregar';
import { seccionVacia, type Seccion } from '@/lib/reportes/tablas';
import { useGuardaPin } from './GuardaPin';
import { NavegacionSecciones, SECCIONES, type SeccionModulo } from './NavegacionSecciones';
import { FiltroRango } from './FiltroRango';
import { EstadoVacioReporte } from './EstadoVacioReporte';
import { BotonesExportar } from './BotonesExportar';
import { SeccionResumen } from './SeccionResumen';
import { SeccionVentas } from './SeccionVentas';
import { SeccionProductos } from './SeccionProductos';
import { SeccionTurnos } from './SeccionTurnos';
import { SeccionGastos } from './SeccionGastos';
import { SeccionMetodos } from './SeccionMetodos';
import { SeccionAutoconsumo } from './SeccionAutoconsumo';
import { SeccionConfiguracion } from './SeccionConfiguracion';
import { SeccionCajaMayor } from './SeccionCajaMayor';
import { SeccionVales } from './SeccionVales';

/** Secciones que se calculan con reporte_rango y se pueden exportar. */
function esSeccionReporte(s: SeccionModulo): s is Seccion {
  switch (s) {
    case 'resumen':
    case 'ventas':
    case 'productos':
    case 'turnos':
    case 'gastos':
    case 'metodos':
    case 'autoconsumo':
      return true;
    case 'vales':
    case 'caja-mayor':
    case 'configuracion':
      return false;
  }
}

/**
 * Sin nada que descargar. En pantalla Turnos nunca se considera vacía (muestra turnos
 * abiertos sin ventas ni gastos); para exportar, se deshabilita solo si no hay turnos,
 * así el PDF/CSV contiene lo mismo que la pantalla y no sale un archivo sin filas.
 */
function exportacionVacia(r: Reporte, s: Seccion): boolean {
  return s === 'turnos' ? r.turnos.length === 0 : seccionVacia(r, s);
}

interface EstadoReporte {
  reporte: Reporte | null;
  /** Rango al que corresponde `reporte`. */
  rangoReporte: Rango | null;
  cargando: boolean;
  error: string | null;
}

const ESTADO_INICIAL: EstadoReporte = { reporte: null, rangoReporte: null, cargando: false, error: null };

function mismoRango(a: Rango | null, b: Rango): boolean {
  return a !== null && a.desde === b.desde && a.hasta === b.hasta;
}

function mensajeError(error: unknown): string {
  if (error instanceof ErrorApp && error.codigo === 'SIN_CONEXION') {
    return 'Sin conexión. Revise el internet y vuelva a intentar.';
  }
  if (error instanceof ErrorApp && error.codigo === 'RANGO_INVALIDO') {
    return 'El rango de fechas no es válido. Elija otro rango.';
  }
  return 'No se pudo cargar el reporte. Intente de nuevo.';
}

function formatearDia(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

function textoRango(r: Rango): string {
  return r.desde === r.hasta ? formatearDia(r.desde) : `${formatearDia(r.desde)} al ${formatearDia(r.hasta)}`;
}

const claseEnlace =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage focus-visible:ring-offset-2';

export function ModuloReportes() {
  const { revisarAcceso } = useGuardaPin();
  const [seccion, setSeccion] = useState<SeccionModulo>('resumen');
  const [rango, setRango] = useState<Rango>(() => atajoRango('hoy'));
  const [estado, setEstado] = useState<EstadoReporte>(ESTADO_INICIAL);
  const peticion = useRef(0);

  // Caja mayor y Vales usan el rango pero cargan sus propios datos.
  const esReporte = esSeccionReporte(seccion);
  const usaRango = esReporte || seccion === 'caja-mayor' || seccion === 'vales';

  const cargar = useCallback(
    async (r: Rango) => {
      // Req 15.2: si el acceso venció, GuardaPin vuelve a pedir el PIN y no se consulta.
      if (!revisarAcceso()) return;
      const id = ++peticion.current;
      setEstado((prev) => ({ ...prev, cargando: true, error: null }));
      try {
        const datos = await obtenerReporte(r);
        if (id !== peticion.current) return;
        setEstado({ reporte: construirReporte(datos), rangoReporte: r, cargando: false, error: null });
      } catch (err) {
        if (id !== peticion.current) return;
        // Req 12.13: sin cifras de un rango distinto al elegido.
        setEstado((prev) =>
          mismoRango(prev.rangoReporte, r)
            ? { ...prev, cargando: false, error: mensajeError(err) }
            : { reporte: null, rangoReporte: null, cargando: false, error: mensajeError(err) },
        );
      }
    },
    [revisarAcceso],
  );

  // Recalcula al cambiar el rango y al volver a una sección de reporte desde Configuración
  // o Caja mayor (los nombres de métodos o categorías pueden haber cambiado).
  useEffect(() => {
    if (!esReporte) return;
    void cargar(rango);
  }, [esReporte, rango, cargar]);

  // Respuestas pendientes al desmontar quedan descartadas.
  useEffect(
    () => () => {
      peticion.current += 1;
    },
    [],
  );

  const aplicarRango = useCallback((r: Rango) => {
    setRango((prev) => (prev.desde === r.desde && prev.hasta === r.hasta ? prev : r));
  }, []);

  const etiqueta = SECCIONES.find((s) => s.id === seccion)?.etiqueta ?? '';
  const reporte = mismoRango(estado.rangoReporte, rango) ? estado.reporte : null;
  const vacio = reporte === null || !esSeccionReporte(seccion) || exportacionVacia(reporte, seccion);

  return (
    <div className="min-h-screen bg-lz-linen font-lz-sans text-lz-charcoal">
      <header className="border-b border-lz-border bg-lz-surface shadow-lz-soft">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <LogoLizpan alto={80} />
            <h1 className="font-lz-display text-xl font-bold text-lz-charcoal sm:text-2xl">Reportes</h1>
          </div>
          <nav aria-label="Navegación" className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className={`${claseEnlace} border border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-sage-light`}
            >
              Administración
            </Link>
            <Link href="/caja" className={`${claseEnlace} bg-lz-sage text-lz-surface hover:bg-lz-sage-dark`}>
              Ir a Caja
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:py-6">
        <NavegacionSecciones activa={seccion} onCambiar={setSeccion} />

        {usaRango && <FiltroRango rango={rango} onAplicar={aplicarRango} />}

        <section aria-labelledby="lz-seccion-titulo" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <h2 id="lz-seccion-titulo" className="font-lz-display text-lg font-bold text-lz-charcoal sm:text-xl">
                {etiqueta}
              </h2>
              {usaRango && <p className="text-sm text-lz-charcoal-muted">{textoRango(rango)}</p>}
            </div>
            {esSeccionReporte(seccion) && (
              <BotonesExportar
                reporte={reporte}
                seccion={seccion}
                rango={rango}
                vacio={vacio || estado.cargando}
              />
            )}
          </div>

          {esSeccionReporte(seccion) ? (
            <ContenidoReporte
              seccion={seccion}
              reporte={reporte}
              cargando={estado.cargando}
              error={estado.error}
              onReintentar={() => void cargar(rango)}
            />
          ) : seccion === 'vales' ? (
            <SeccionVales rango={rango} />
          ) : seccion === 'caja-mayor' ? (
            <SeccionCajaMayor rango={rango} revisarAcceso={revisarAcceso} />
          ) : (
            <SeccionConfiguracion />
          )}
        </section>
      </main>
    </div>
  );
}

interface ContenidoReporteProps {
  seccion: Seccion;
  reporte: Reporte | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
}

function ContenidoReporte({ seccion, reporte, cargando, error, onReintentar }: ContenidoReporteProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-6 text-center"
      >
        <p className="font-lz-display text-base font-bold text-lz-danger">No se pudo cargar el reporte</p>
        <p className="text-sm text-lz-charcoal">{error}</p>
        <button
          type="button"
          onClick={onReintentar}
          disabled={cargando}
          className="min-h-[44px] min-w-[44px] rounded-xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
        >
          {cargando ? 'Reintentando…' : 'Reintentar'}
        </button>
      </div>
    );
  }

  if (cargando || reporte === null) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-3 rounded-2xl border border-lz-border bg-lz-surface px-4 py-12 text-base text-lz-charcoal-muted"
      >
        <span
          aria-hidden
          className="h-5 w-5 animate-spin rounded-full border-2 border-lz-sage-light border-t-lz-sage"
        />
        Cargando reporte…
      </div>
    );
  }

  // Req 12.10: Turnos puede seguir mostrando turnos abiertos sin ventas ni gastos
  // (seccionVacia nunca la considera vacía). Autoconsumo: barra-acciones-caja Req 12.6.
  if (seccionVacia(reporte, seccion)) return <EstadoVacioReporte />;

  switch (seccion) {
    case 'resumen':
      return <SeccionResumen reporte={reporte} />;
    case 'ventas':
      return <SeccionVentas reporte={reporte} />;
    case 'productos':
      return <SeccionProductos reporte={reporte} />;
    case 'turnos':
      return <SeccionTurnos reporte={reporte} />;
    case 'gastos':
      return <SeccionGastos reporte={reporte} />;
    case 'metodos':
      return <SeccionMetodos reporte={reporte} />;
    case 'autoconsumo':
      return <SeccionAutoconsumo reporte={reporte} />;
  }
}

export default ModuloReportes;
