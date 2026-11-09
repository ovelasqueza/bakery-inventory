'use client';

// Pantalla de cobro dentro de la Caja (no es una ventana encima): reemplaza la cuadrícula de productos
// y el pedido sigue visible al lado. Billetes y monedas suman lo recibido; teclado en pantalla y físico.
// Basado en el cobro de pos-management-platform (Req 6, 17.7, 17.8).

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { subtotalLinea } from '@/lib/caja/carrito';
import { RECIBIDO_MAX, firmaPedido, pedidoVacio, totalPedido, type PedidoCobro } from '@/lib/caja/cobro';
import { registrarVenta, registrarVentaValor, type VentaRegistrada } from '@/lib/api/ventas';
import { ErrorApp } from '@/lib/api/errores';
import type { MetodoPagoParam } from '@/lib/api/parametros';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import { obtenerImagenCacheada, obtenerUrlEnMemoria, precargarBilletesYMonedas } from '@/lib/caja/cacheImagenes';
import { imprimirReciboVenta, mensajeImpresionVenta } from '@/lib/recibo/reciboVenta';
import { useToast } from '@/components/ui';
import { AvisoSinConexion } from './AvisoSinConexion';

export type AccionConfirmarCobro = {
  puedeConfirmar: boolean;
  registrando: boolean;
  textoBoton: string;
  confirmar: () => void;
};

interface PanelCobroProps {
  abierto: boolean;
  /** Lo que se cobra: el Carrito de productos o la lista de valores de la Calculadora (Req 5.1). */
  pedido: PedidoCobro;
  turnoId: string;
  /** Métodos de pago activos, ya ordenados. */
  metodos: MetodoPagoParam[];
  onCancelar: () => void;
  onRegistrada: (venta: VentaRegistrada, esEfectivo: boolean, opciones?: { metodoNombre?: string | null; yaImpreso?: boolean }) => void;
  onTurnoCerrado: () => void;
  /** El padre recarga el catálogo y concilia el Carrito. Solo aplica a un pedido de productos. */
  onPreciosActualizados?: () => void;
  abrirCajon: () => Promise<void>;
  /** Espacio libre al final del scroll, en px, para que el botón flotante no tape "Cobrar" (Req 4.6). */
  reservaInferior?: number;
  /** Sincroniza el estado de confirmación con el botón "Cobrar" del panel derecho. */
  onCambioConfirmacion?: (accion: AccionConfirmarCobro | null) => void;
}

type ErrorCobro = { tipo: 'sin_conexion' } | { tipo: 'mensaje'; texto: string } | null;

/* Billetes y monedas de Colombia: imágenes en public/billetes. */
const BILLETES = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000];
const MONEDAS = [50, 100, 200, 500, 1_000];
const TECLAS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '000', '0', 'borrar'] as const;
type Tecla = (typeof TECLAS)[number];

const miles = (v: number) => new Intl.NumberFormat('es-CO').format(v);

const TARJETA =
  'rounded-2xl border border-lz-border bg-lz-surface shadow-lz-soft transition active:scale-[0.97] active:bg-lz-sage-light hover:border-lz-sage-tint disabled:opacity-40';

/** Columnas en pantallas medianas o más: 3 iguales para billetes y resumen · 1 para el teclado. */
const COLUMNAS = 'grid-cols-3 md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(12rem,16rem)]';

function metodoInicial(metodos: MetodoPagoParam[]): string | null {
  const activos = metodos.filter((m) => m.activo);
  return (activos.find((m) => m.esEfectivo) ?? activos[0])?.id ?? null;
}

export function PanelCobro({
  abierto,
  pedido,
  turnoId,
  metodos,
  onCancelar,
  onRegistrada,
  onTurnoCerrado,
  onPreciosActualizados,
  abrirCajon,
  reservaInferior,
  onCambioConfirmacion,
}: PanelCobroProps) {
  const { showToast } = useToast();
  const enProceso = useRef(false);
  const metodosRef = useRef(metodos);
  metodosRef.current = metodos;

  const [metodoId, setMetodoId] = useState<string | null>(() => metodoInicial(metodos));
  const [recibido, setRecibido] = useState(0);
  const [imprimirTiquete, setImprimirTiquete] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<ErrorCobro>(null);

  const activos = metodos.filter((m) => m.activo);
  const metodo = activos.find((m) => m.id === metodoId) ?? null;
  const esEfectivo = metodo?.esEfectivo ?? false;
  const total = totalPedido(pedido);
  const vacio = pedidoVacio(pedido);
  const completo = recibido >= total;
  const cambio = recibido - total;
  const falta = Math.max(0, total - recibido);

  const { clave, renovar } = useClaveIdempotente(
    `${firmaPedido(pedido)}|${metodoId ?? ''}|${esEfectivo ? recibido : ''}`
  );

  // Cada vez que se entra al cobro empieza limpio, con efectivo escogido y sin imprimir por defecto.
  useEffect(() => {
    if (!abierto) return;
    setMetodoId(metodoInicial(metodosRef.current));
    setRecibido(0);
    setImprimirTiquete(false);
    setError(null);
    setRegistrando(false);
    enProceso.current = false;
  }, [abierto]);

  const puedeConfirmar =
    !registrando && !vacio && metodo !== null && (!esEfectivo || completo);

  const confirmar = useCallback(async (recibidoOverride?: number) => {
    const montoRecibido = typeof recibidoOverride === 'number' ? recibidoOverride : recibido;
    if (enProceso.current || !metodo || pedidoVacio(pedido)) return;
    if (metodo.esEfectivo && montoRecibido < total) return;
    enProceso.current = true;
    setRegistrando(true);
    setError(null);
    if (metodo.esEfectivo) {
      // Dispara la apertura del cajón de inmediato en paralelo para que abra al instante sin esperar la red.
      void abrirCajon().catch(() => undefined);
    }
    try {
      const base = {
        clave,
        turnoId,
        metodoPagoId: metodo.id,
        recibido: metodo.esEfectivo ? montoRecibido : null,
      };
      const valores = pedido.valores ?? [];
      const tieneProductos = pedido.tipo === 'productos' && pedido.carrito.length > 0;
      const venta = tieneProductos
        ? await registrarVenta({
            ...base,
            lineas: pedido.carrito.map((l) => ({
              productoId: l.productoId,
              cantidad: l.cantidad,
              precio: l.precio,
              subtotal: subtotalLinea(l),
              promocion: l.promocion ?? null,
            })),
            valores,
          })
        : await registrarVentaValor({ ...base, valores });
      if (imprimirTiquete) {
        void imprimirReciboVenta(venta.ventaId, metodo.nombre).then((r) => {
          showToast(mensajeImpresionVenta(r), r.ok ? 'success' : 'warning');
        });
      }
      renovar();
      onRegistrada(venta, venta.esEfectivo, { metodoNombre: metodo.nombre, yaImpreso: imprimirTiquete });
    } catch (e) {
      const codigo = e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
      const esProductos = pedido.tipo === 'productos' && pedido.carrito.length > 0;
      switch (codigo) {
        case 'SIN_CONEXION':
          setError({ tipo: 'sin_conexion' });
          break;
        case 'TURNO_CERRADO':
          onTurnoCerrado();
          break;
        // Estos dos solo tienen sentido para un pedido de productos.
        case 'PRECIOS_ACTUALIZADOS':
          if (!esProductos) {
            setError({ tipo: 'mensaje', texto: 'La venta no se guardó. Intente de nuevo.' });
            break;
          }
          setError({ tipo: 'mensaje', texto: 'Algunos precios cambiaron. Revise el pedido.' });
          onPreciosActualizados?.();
          break;
        case 'PRODUCTO_NO_DISPONIBLE':
          if (!esProductos) {
            setError({ tipo: 'mensaje', texto: 'La venta no se guardó. Intente de nuevo.' });
            break;
          }
          setError({ tipo: 'mensaje', texto: 'Algún producto ya no está disponible. Revise el pedido.' });
          onPreciosActualizados?.();
          break;
        case 'METODO_INVALIDO':
          setError({ tipo: 'mensaje', texto: 'Ese método de pago ya no está disponible. Escoja otro.' });
          break;
        case 'RECIBIDO_INVALIDO':
          setError({ tipo: 'mensaje', texto: 'El valor recibido no es válido. Revíselo.' });
          break;
        default:
          setError({ tipo: 'mensaje', texto: 'La venta no se guardó. Intente de nuevo.' });
      }
    } finally {
      enProceso.current = false;
      setRegistrando(false);
    }
  }, [abrirCajon, pedido, clave, imprimirTiquete, metodo, onPreciosActualizados, onRegistrada, onTurnoCerrado, recibido, renovar, showToast, total, turnoId]);

  const textoBoton = esEfectivo && completo && cambio > 0 ? `Cobrar · Cambio ${formatCurrency(cambio)}` : 'Cobrar';

  useEffect(() => {
    if (!abierto) {
      onCambioConfirmacion?.(null);
      return;
    }
    onCambioConfirmacion?.({
      puedeConfirmar,
      registrando,
      textoBoton,
      confirmar: () => void confirmar(),
    });
    return () => {
      onCambioConfirmacion?.(null);
    };
  }, [abierto, confirmar, onCambioConfirmacion, puedeConfirmar, registrando, textoBoton]);

  const volver = useCallback(() => {
    if (enProceso.current) return;
    onCancelar();
  }, [onCancelar]);

  const sumar = (v: number) => {
    if (registrando) return;
    setError(null);
    setRecibido((r) => Math.min(r + v, RECIBIDO_MAX));
  };

  /** Teclado: edita el valor recibido dígito a dígito. */
  const teclear = useCallback(
    (t: Tecla | 'limpiar') => {
      if (registrando) return;
      setError(null);
      if (t === 'limpiar') return setRecibido(0);
      setRecibido((r) => {
        const actual = r === 0 ? '' : String(r);
        if (t === 'borrar') return Number(actual.slice(0, -1) || '0');
        const nuevo = Number(actual + t);
        return nuevo > RECIBIDO_MAX ? r : nuevo;
      });
    },
    [registrando]
  );

  // Teclado físico: dígitos, Retroceso, Supr (borra todo), Enter (cobrar) y Escape (volver).
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || registrando) return;
      // Lo que se escribe en un campo (p. ej. la cantidad del pedido) no es para el cobro.
      const objetivo = e.target as HTMLElement | null;
      if (objetivo && (objetivo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(objetivo.tagName))) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        volver();
      } else if (e.key === 'Enter') {
        if (puedeConfirmar) {
          e.preventDefault();
          void confirmar();
        }
      } else if (esEfectivo && /^\d$/.test(e.key)) {
        e.preventDefault();
        teclear(e.key as Tecla);
      } else if (esEfectivo && e.key === 'Backspace') {
        e.preventDefault();
        teclear('borrar');
      } else if (esEfectivo && e.key === 'Delete') {
        e.preventDefault();
        teclear('limpiar');
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto, confirmar, esEfectivo, puedeConfirmar, registrando, teclear, volver]);

  const errorVista = (
    <>
      {error?.tipo === 'sin_conexion' && (
        <AvisoSinConexion
          mensaje="La venta no se confirmó. Revise el internet y vuelva a intentar."
          onReintentar={() => void confirmar()}
          reintentando={registrando}
        />
      )}
      {error?.tipo === 'mensaje' && (
        <p
          role="alert"
          className="shrink-0 rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3 text-base font-semibold text-lz-danger"
        >
          {error.texto}
        </p>
      )}
    </>
  );

  return (
    <section
      aria-label="Cobro"
      aria-hidden={!abierto || undefined}
      className={`h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 ${abierto ? 'flex' : 'hidden'}`}
      style={reservaInferior !== undefined ? { paddingBottom: reservaInferior } : undefined}
    >
      {/* Fila 1: Volver + métodos de pago */}
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={volver}
          disabled={registrando}
          className="flex min-h-[56px] shrink-0 items-center gap-2 rounded-2xl border-2 border-lz-border bg-lz-surface px-4 text-base font-semibold text-lz-charcoal transition-colors hover:bg-lz-oat disabled:opacity-50"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Volver
        </button>
        {activos.length === 0 ? (
          <p className="flex flex-1 items-center text-sm font-semibold text-lz-danger">No hay métodos de pago activos.</p>
        ) : (
          <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2" role="radiogroup" aria-label="Método de pago">
            {activos.map((m) => {
              const elegido = m.id === metodoId;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={elegido}
                  disabled={registrando}
                  onClick={() => {
                    setMetodoId(m.id);
                    setError(null);
                  }}
                  className={`min-h-[56px] rounded-2xl border-2 px-3 font-lz-display text-lg font-bold transition-colors disabled:opacity-50 ${
                    elegido
                      ? 'border-lz-sage bg-lz-sage text-lz-surface shadow-lz-soft'
                      : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
                  }`}
                >
                  {m.nombre}
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          aria-pressed={imprimirTiquete}
          disabled={registrando}
          onClick={() => setImprimirTiquete((v) => !v)}
          className={`flex min-h-[56px] shrink-0 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold transition-colors disabled:opacity-50 ${
            imprimirTiquete
              ? 'border-lz-sage bg-lz-sage-light text-lz-sage-dark'
              : 'border-lz-border bg-lz-surface text-lz-charcoal-muted hover:bg-lz-oat hover:text-lz-charcoal'
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          {imprimirTiquete ? 'Imprimir: Sí' : 'Imprimir: No'}
        </button>
      </div>

      {metodo && esEfectivo ? (
        <>
          {/* Fila 2: Total · Cambio/Falta · Recibido (encima del teclado) */}
          <div className={`grid shrink-0 gap-2 ${COLUMNAS}`}>
            <Dato titulo="TOTAL" valor={total} />
            <div className="col-span-2">
              {completo ? (
                <Dato titulo="CAMBIO A ENTREGAR" valor={cambio} grande estilo="border-2 border-lz-sage bg-lz-sage-light text-lz-sage-dark" />
              ) : (
                <Dato titulo="FALTA" valor={falta} grande estilo="border-2 border-lz-amber bg-lz-amber-light text-lz-amber" />
              )}
            </div>
            <div
              className="relative col-span-3 flex flex-col justify-center rounded-2xl border-2 border-lz-sage bg-lz-surface px-3 py-2 md:col-span-1"
              aria-live="polite"
            >
              <p className="text-xs font-bold text-lz-charcoal-muted">RECIBIDO</p>
              <p className={`truncate pr-9 text-right font-lz-display text-3xl font-bold tabular-nums ${recibido ? 'text-lz-charcoal' : 'text-lz-charcoal-muted'}`}>
                {formatCurrency(recibido)}
                <span className="ml-0.5 inline-block w-0.5 animate-pulse bg-lz-sage align-middle" style={{ height: '0.9em' }} aria-hidden="true" />
              </p>
              <button
                type="button"
                onClick={() => teclear('limpiar')}
                disabled={recibido === 0 || registrando}
                aria-label="Borrar todo lo recibido"
                title="Borrar todo"
                className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full text-lz-charcoal-muted hover:bg-lz-danger-surface hover:text-lz-danger disabled:opacity-0"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Fila 3: billetes | teclado; abajo monedas | paga exacto */}
          <div className={`grid min-h-[22rem] flex-1 gap-2 md:grid-rows-[minmax(0,1fr)_auto] ${COLUMNAS}`}>
            <div className="col-span-3 grid min-h-0 grid-cols-3 grid-rows-2 gap-2">
              {BILLETES.map((valor) => {
                const ruta = `/billetes/${valor}_new.webp`;
                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => sumar(valor)}
                    disabled={registrando}
                    aria-label={`Billete de ${miles(valor)}`}
                    className={`flex min-h-[5.5rem] flex-col items-center gap-1 p-2 ${TARJETA}`}
                  >
                    <span className="relative min-h-0 w-full flex-1">
                      <ImagenDenominacion ruta={ruta} className="absolute inset-0 h-full w-full object-contain" />
                    </span>
                    <span className="shrink-0 font-lz-display text-lg font-bold text-lz-charcoal tabular-nums">${miles(valor)}</span>
                  </button>
                );
              })}
            </div>

            <div className="col-span-3 grid min-h-0 grid-cols-3 grid-rows-4 gap-2 md:col-span-1" role="group" aria-label="Teclado numérico">
              {TECLAS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => teclear(t)}
                  disabled={registrando || (t === 'borrar' && recibido === 0)}
                  aria-label={t === 'borrar' ? 'Borrar último dígito' : t}
                  className={`flex min-h-[3rem] items-center justify-center font-lz-display text-3xl font-bold text-lz-charcoal tabular-nums ${TARJETA}`}
                >
                  {t === 'borrar' ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
                      <path d="M17 9l-5 5M12 9l5 5" />
                    </svg>
                  ) : (
                    t
                  )}
                </button>
              ))}
            </div>

            <div className="col-span-3 grid grid-cols-5 gap-2">
              {MONEDAS.map((valor) => {
                const ruta = `/billetes/moneda-${valor}.webp`;
                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => sumar(valor)}
                    disabled={registrando}
                    aria-label={`Moneda de ${miles(valor)}`}
                    className={`flex flex-col items-center gap-1 p-2 ${TARJETA}`}
                  >
                    <ImagenDenominacion ruta={ruta} className="h-11 w-11 object-contain" />
                    <span className="font-lz-display text-sm font-bold text-lz-charcoal tabular-nums">${miles(valor)}</span>
                  </button>
                );
              })}
            </div>

            {/* Paga exacto: pone el total como recibido y cobra de inmediato */}
            <button
              type="button"
              disabled={registrando || vacio}
              onClick={() => {
                setError(null);
                setRecibido(total);
                void confirmar(total);
              }}
              className="col-span-3 flex min-h-[64px] flex-col items-center justify-center rounded-2xl border-2 border-lz-sage bg-lz-sage-light font-bold text-lz-sage-dark transition active:scale-[0.97] active:bg-lz-sage active:text-lz-surface disabled:opacity-50 md:col-span-1"
            >
              <span className="text-xs tracking-wider">PAGA EXACTO</span>
              <span className="font-lz-display text-2xl tabular-nums">{formatCurrency(total)}</span>
            </button>
          </div>

          {errorVista}
        </>
      ) : metodo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <div className="rounded-3xl bg-lz-sage-light px-10 py-6">
            <p className="text-sm font-bold text-lz-charcoal-muted">TOTAL</p>
            <p className="font-lz-display text-5xl font-bold tabular-nums text-lz-sage-dark">{formatCurrency(total)}</p>
          </div>
          <p className="max-w-md text-lg text-lz-charcoal">
            Cobre con {metodo.nombre} y confirme cuando vea el pago.
          </p>
          {errorVista}
        </div>
      ) : null}
    </section>
  );
}

function Dato({
  titulo,
  valor,
  estilo = 'border border-lz-border bg-lz-surface text-lz-charcoal',
  grande,
}: {
  titulo: string;
  valor: number;
  estilo?: string;
  grande?: boolean;
}) {
  return (
    <div className={`flex h-full flex-col justify-center rounded-2xl px-3 py-2 ${estilo}`} aria-live="polite">
      <p className="text-xs font-bold opacity-80">{titulo}</p>
      <p className={`truncate font-lz-display font-bold tabular-nums ${grande ? 'text-4xl tracking-tight' : 'text-2xl'}`}>
        {formatCurrency(valor)}
      </p>
    </div>
  );
}

function ImagenDenominacion({ ruta, className }: { ruta: string; className: string }) {
  const [src, setSrc] = useState<string>(() => obtenerUrlEnMemoria(ruta) ?? ruta);

  useEffect(() => {
    precargarBilletesYMonedas();
    const enRam = obtenerUrlEnMemoria(ruta);
    if (enRam) {
      setSrc(enRam);
      return;
    }
    let cancelado = false;
    void obtenerImagenCacheada(ruta).then((urlLocal) => {
      if (!cancelado) setSrc(urlLocal);
    });
    return () => {
      cancelado = true;
    };
  }, [ruta]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="eager" decoding="sync" draggable={false} className={className} />
  );
}

export default PanelCobro;