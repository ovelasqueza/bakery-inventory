'use client';

// Panel del Carrito de la Caja (Req 5.3-5.7, 5.9-5.11, 6.1, 9.3-9.5, 9.7, 9.8, 9.10).
// Escritorio: panel lateral derecho. Móvil: barra inferior fija que se expande sobre la cuadrícula.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { MetodoPagoParam } from '@/lib/api/parametros';
import { MEDIDAS, type LayoutCaja } from '@/lib/caja/layout';
import { totalValores, type ValorLista } from '@/lib/caja/calculadora';
import {
  CANTIDAD_MAX,
  articulosCarrito,
  descomponerCantidadConPromo,
  parsearCantidad,
  subtotalLinea,
  tienePromoAplicada,
  totalCarrito,
  type AccionCarrito,
  type Carrito,
  type LineaCarrito,
  type ResultadoCarrito,
} from '@/lib/caja/carrito';
import { AvisoSinConexion } from './AvisoSinConexion';
import type { ErrorCobroDirecto } from './PanelValores';
import type { ModoLista } from './TarjetaProducto';

const MENSAJE_CANTIDAD_INVALIDA = `La cantidad debe ser un entero entre 1 y ${CANTIDAD_MAX}`;
const MENSAJE_CANTIDAD_MAXIMA = `Cantidad máxima: ${CANTIDAD_MAX}`;
const DURACION_AVISO_MS = 3000;
const SIN_VALORES: ValorLista[] = [];
const SIN_METODOS: MetodoPagoParam[] = [];

interface PanelCarritoProps {
  carrito: Carrito;
  layout: LayoutCaja;
  /** Aplica la acción al Carrito y devuelve el resultado (con su aviso, si lo hay). */
  despachar: (accion: AccionCarrito) => ResultadoCarrito;
  onCobrar: () => void;
  /** Móvil: el Carrito está expandido sobre la cuadrícula. */
  expandido: boolean;
  onExpandir: (expandido: boolean) => void;
  /** Título del panel (Req 8.1). Por defecto "Pedido". */
  titulo?: string;
  /** Texto del botón de acción. Por defecto "Cobrar". */
  textoAccion?: string;
  /** Texto cuando no hay líneas. */
  textoVacio?: string;
  /** Texto bajo el total (p. ej. aclaración del autoconsumo). Por defecto ninguno. */
  nota?: string;
  /** Lista que muestra el panel. Por defecto 'venta' (sin cambios). */
  modo?: ModoLista;
  /** Deshabilita el botón de acción (p. ej. mientras falta efectivo recibido en el cobro). */
  deshabilitarAccion?: boolean;
  /** Muestra estado de guardado en el botón de acción. */
  cargandoAccion?: boolean;
  /** Valores agregados desde la calculadora al mismo pedido. */
  valores?: ValorLista[];
  /** Valor digitado pendiente en el visor de la calculadora. */
  digitadoCalculadora?: number;
  /** Quita un valor de la calculadora del pedido. */
  onQuitarValor?: (id: number) => void;
  /** Vacía también los valores y el digitado de la calculadora al vaciar el pedido. */
  onVaciarValores?: () => void;
  /** Muestra el selector de método de pago para cobro directo (cuando solo hay calculadora). */
  mostrarSelectorMetodo?: boolean;
  metodosPago?: MetodoPagoParam[];
  metodoPagoId?: string | null;
  onMetodoPago?: (id: string) => void;
  errorCobroDirecto?: ErrorCobroDirecto;
  onReintentarCobroDirecto?: () => void;
}

const TITULO_POR_DEFECTO: Record<ModoLista, string> = {
  venta: 'Pedido',
  autoconsumo: 'Autoconsumo',
};
const TEXTO_ACCION_POR_DEFECTO: Record<ModoLista, string> = {
  venta: 'Cobrar',
  autoconsumo: 'Registrar consumo',
};
const TEXTO_VACIO_POR_DEFECTO = 'Toca un producto para agregarlo al pedido.';

/** Clases de color por modo (solo Clase_Lz). */
const TONO: Record<
  ModoLista,
  {
    contenedor: string;
    franja: string;
    boton: string;
    hoverContraer: string;
    barraMovil: string;
    hoverBarra: string;
    textoVer: string;
  }
> = {
  venta: {
    contenedor: 'border-lz-border bg-lz-surface',
    franja: 'border-lz-border bg-lz-oat',
    boton: 'border-lz-sage-medium bg-lz-sage-dark text-lz-surface hover:bg-lz-sage',
    hoverContraer: 'hover:bg-lz-sage-light hover:text-lz-sage',
    barraMovil: 'border-t border-lz-border bg-lz-surface',
    hoverBarra: 'hover:bg-lz-sage-light',
    textoVer: 'text-lz-sage',
  },
  autoconsumo: {
    contenedor: 'border-lz-amber bg-lz-surface',
    franja: 'border-lz-amber bg-lz-amber-light',
    boton: 'border-lz-amber-warm bg-lz-amber text-lz-charcoal hover:bg-lz-amber-warm',
    hoverContraer: 'hover:bg-lz-amber-light',
    barraMovil: 'border-t-4 border-lz-amber bg-lz-amber-light',
    hoverBarra: 'hover:bg-lz-surface',
    textoVer: 'text-lz-charcoal',
  },
};

type Aviso = { texto: string; id: number };

function textoArticulos(n: number) {
  return `${n} ${n === 1 ? 'artículo' : 'artículos'}`;
}

function textoValores(n: number) {
  return `${n} ${n === 1 ? 'valor' : 'valores'}`;
}

function textoResumenPedido(articulos: number, cantidadValores: number) {
  if (articulos > 0 && cantidadValores > 0) {
    return `${textoArticulos(articulos)} · ${textoValores(cantidadValores)}`;
  }
  if (articulos === 0 && cantidadValores > 0) {
    return textoValores(cantidadValores);
  }
  return textoArticulos(articulos);
}

function Icono({ children, className = 'h-5 w-5' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ICONO_PAPELERA = (
  <Icono>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Icono>
);

const ICONO_CONTRAER = (
  <Icono>
    <path d="M6 9l6 6 6-6" />
  </Icono>
);

const ICONO_EXPANDIR = (
  <Icono>
    <path d="M18 15l-6-6-6 6" />
  </Icono>
);

/** Una línea del Carrito con controles de cantidad. */
function LineaPedido({
  linea,
  despachar,
  onAviso,
  sinPrecio = false,
}: {
  linea: LineaCarrito;
  despachar: PanelCarritoProps['despachar'];
  onAviso: (texto: string) => void;
  /** Autoconsumo: sin precio por unidad ni subtotal. */
  sinPrecio?: boolean;
}) {
  const { productoId, nombre, precio, cantidad } = linea;
  const [texto, setTexto] = useState(String(cantidad));
  const [editando, setEditando] = useState(false);
  /** Escape: salir del campo sin aplicar lo escrito. */
  const cancelado = useRef(false);

  // Sincroniza el campo con la cantidad cuando cambia desde fuera (botones, cuadrícula).
  useEffect(() => {
    if (!editando) setTexto(String(cantidad));
  }, [cantidad, editando]);

  const restaurar = () => setTexto(String(cantidad));

  const confirmarCantidad = () => {
    setEditando(false);
    if (cancelado.current) {
      cancelado.current = false;
      restaurar();
      return;
    }
    const leido = parsearCantidad(texto);
    if (!leido.ok) {
      restaurar();
      onAviso(MENSAJE_CANTIDAD_INVALIDA);
      return;
    }
    if (leido.valor === cantidad) {
      restaurar();
      return;
    }
    const r = despachar({ tipo: 'fijar', productoId, cantidad: leido.valor });
    if (r.aviso === 'CANTIDAD_INVALIDA') {
      restaurar();
      onAviso(MENSAJE_CANTIDAD_INVALIDA);
    }
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelado.current = true;
      e.currentTarget.blur();
    }
  };

  const sumar = () => {
    const r = despachar({ tipo: 'sumar', productoId });
    if (r.aviso === 'CANTIDAD_MAXIMA') onAviso(MENSAJE_CANTIDAD_MAXIMA);
  };

  const botonCantidad =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-lz-surface text-xl font-bold text-lz-charcoal transition active:scale-90';

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-bold text-lz-charcoal" title={nombre}>
            {nombre}
          </h4>
          {!sinPrecio && (
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-xs text-lz-charcoal-muted">{formatCurrency(precio)} c/u</p>
              {tienePromoAplicada(linea) &&
                linea.promocion &&
                (() => {
                  const d = descomponerCantidadConPromo(linea.cantidad, linea.precio, linea.promocion);
                  const textoBadge =
                    d.unidadesNormales > 0
                      ? `Promo ${d.unidadesPromo} (${formatCurrency(d.subtotalPromo)}) + ${d.unidadesNormales} (${formatCurrency(d.subtotalNormal)})`
                      : `Promo ${d.unidadesPromo} × ${formatCurrency(d.subtotalPromo)}`;
                  return (
                    <span className="inline-flex items-center rounded-md bg-lz-amber-light px-1.5 py-0.5 text-[11px] font-bold text-lz-amber">
                      {textoBadge}
                    </span>
                  );
                })()}
            </div>
          )}
        </div>
        {!sinPrecio && (
          <span className="shrink-0 font-lz-display text-base font-bold text-lz-charcoal tabular-nums">
            {formatCurrency(subtotalLinea(linea))}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-lz-border bg-lz-oat p-0.5">
          <button
            type="button"
            onClick={() => despachar({ tipo: 'restar', productoId })}
            aria-label={cantidad <= 1 ? `Quitar ${nombre}` : `Disminuir ${nombre}`}
            className={`${botonCantidad} hover:bg-lz-danger-surface hover:text-lz-danger`}
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={texto}
            onFocus={(e) => {
              setEditando(true);
              e.currentTarget.select();
            }}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={confirmarCantidad}
            onKeyDown={alTeclear}
            aria-label={`Cantidad de ${nombre}`}
            className="h-11 w-14 rounded-lg border border-lz-border bg-lz-surface text-center font-lz-display text-base font-bold text-lz-charcoal tabular-nums focus:border-lz-sage focus:outline-none focus:ring-2 focus:ring-lz-sage-tint"
          />
          <button
            type="button"
            onClick={sumar}
            aria-label={`Aumentar ${nombre}`}
            className={`${botonCantidad} hover:bg-lz-sage-light hover:text-lz-sage-dark`}
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => despachar({ tipo: 'quitar', productoId })}
          aria-label={`Eliminar ${nombre}`}
          title="Eliminar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lz-charcoal-muted transition-colors hover:bg-lz-danger-surface hover:text-lz-danger"
        >
          {ICONO_PAPELERA}
        </button>
      </div>
    </li>
  );
}

/** Una línea de valor agregada desde la calculadora dentro del Pedido. */
function LineaValorPedido({
  valor,
  numero,
  deshabilitado,
  onQuitar,
}: {
  valor: ValorLista;
  numero: number;
  deshabilitado: boolean;
  onQuitar?: () => void;
}) {
  const texto = formatCurrency(valor.valor);
  return (
    <li className="flex items-center justify-between gap-2 py-3">
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-bold text-lz-charcoal">
          Venta por valor <span className="text-xs font-semibold text-lz-charcoal-muted">#{numero}</span>
        </h4>
        <p className="text-xs text-lz-charcoal-muted">Calculadora</p>
      </div>
      <span className="shrink-0 font-lz-display text-base font-bold text-lz-charcoal tabular-nums">
        {texto}
      </span>
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          disabled={deshabilitado}
          aria-label={`Quitar valor ${numero}: ${texto}`}
          title="Quitar valor"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lz-charcoal-muted transition-colors hover:bg-lz-danger-surface hover:text-lz-danger disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ICONO_PAPELERA}
        </button>
      )}
    </li>
  );
}

export function PanelCarrito({
  carrito,
  layout,
  despachar,
  onCobrar,
  expandido,
  onExpandir,
  modo = 'venta',
  titulo = TITULO_POR_DEFECTO[modo],
  textoAccion = TEXTO_ACCION_POR_DEFECTO[modo],
  textoVacio = TEXTO_VACIO_POR_DEFECTO,
  nota,
  deshabilitarAccion = false,
  cargandoAccion = false,
  valores = SIN_VALORES,
  digitadoCalculadora = 0,
  onQuitarValor,
  onVaciarValores,
  mostrarSelectorMetodo = false,
  metodosPago = SIN_METODOS,
  metodoPagoId = null,
  onMetodoPago,
  errorCobroDirecto = null,
  onReintentarCobroDirecto,
}: PanelCarritoProps) {
  const tono = TONO[modo];
  const autoconsumo = modo === 'autoconsumo';
  const tituloMinusculas = titulo.toLocaleLowerCase('es');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);

  const sumaValores = autoconsumo ? 0 : totalValores(valores);
  const total = totalCarrito(carrito) + sumaValores;
  const articulos = articulosCarrito(carrito);
  const cantidadValores = autoconsumo ? 0 : valores.length;
  const sinLineas = carrito.length === 0 && cantidadValores === 0;
  const nadaQueVaciar = sinLineas && (autoconsumo || digitadoCalculadora === 0);
  const sinAccion = sinLineas && (autoconsumo || digitadoCalculadora === 0);
  const totalTexto = formatCurrency(total);
  const resumenCantidad = autoconsumo
    ? textoArticulos(articulos)
    : textoResumenPedido(articulos, cantidadValores);

  const metodosActivos = metodosPago.filter((m) => m.activo);
  const metodoSeleccionado = metodosActivos.find((m) => m.id === metodoPagoId) ?? null;

  useEffect(() => {
    if (!aviso) return;
    const id = window.setTimeout(() => setAviso(null), DURACION_AVISO_MS);
    return () => window.clearTimeout(id);
  }, [aviso]);

  // Sin líneas no hay nada que confirmar.
  useEffect(() => {
    if (nadaQueVaciar || cargandoAccion) setConfirmandoVaciar(false);
  }, [nadaQueVaciar, cargandoAccion]);

  const mostrarAviso = (texto: string) => setAviso({ texto, id: Date.now() });

  const vaciar = () => {
    despachar({ tipo: 'vaciar' });
    onVaciarValores?.();
    setConfirmandoVaciar(false);
  };

  const botonCobrar = (alto: string) => (
    <button
      type="button"
      onClick={onCobrar}
      disabled={sinAccion || deshabilitarAccion || cargandoAccion}
      aria-busy={cargandoAccion || undefined}
      className={`flex ${alto} min-w-[44px] items-center justify-center gap-2 rounded-2xl border ${tono.boton} px-5 font-lz-display text-lg font-bold tracking-wide shadow-lz-soft transition active:scale-[0.98] disabled:cursor-not-allowed disabled:border-lz-border disabled:bg-lz-sand disabled:text-lz-charcoal-muted disabled:active:scale-100`}
    >
      {cargandoAccion && (
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-lz-surface border-t-transparent"
        />
      )}
      {cargandoAccion ? 'Guardando…' : textoAccion}
    </button>
  );

  const regionAviso = (
    <div aria-live="polite" role="status" className="px-4 empty:hidden">
      {aviso && (
        <p
          key={aviso.id}
          className="mt-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-semibold text-lz-danger"
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );

  const selectorMetodo = mostrarSelectorMetodo ? (
    <div className="shrink-0 border-b border-lz-border bg-lz-surface px-4 py-3">
      <p
        id="selector-metodo-pedido"
        className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-lz-charcoal-muted"
      >
        Método de pago (cobro directo)
      </p>
      {metodosActivos.length === 0 ? (
        <p className="text-sm font-semibold text-lz-danger">No hay métodos de pago activos.</p>
      ) : (
        <div role="group" aria-labelledby="selector-metodo-pedido" className="flex flex-wrap gap-2">
          {metodosActivos.map((m) => {
            const escogido = m.id === metodoSeleccionado?.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onMetodoPago?.(m.id)}
                disabled={cargandoAccion}
                aria-pressed={escogido}
                className={`min-h-[44px] min-w-[44px] rounded-xl border px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  escogido
                    ? 'border-lz-sage bg-lz-sage text-lz-surface'
                    : 'border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-sage-light hover:text-lz-sage'
                }`}
              >
                {m.nombre}
              </button>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  const avisoErrorDirecto = !errorCobroDirecto ? null : errorCobroDirecto.tipo === 'sin_conexion' ? (
    <AvisoSinConexion onReintentar={() => onReintentarCobroDirecto?.()} reintentando={cargandoAccion} />
  ) : (
    <p
      role="alert"
      className="rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-semibold text-lz-danger"
    >
      {errorCobroDirecto.texto}
    </p>
  );

  const encabezado = (contraer?: ReactNode) => (
    <div className={`flex shrink-0 flex-col gap-2 border-b ${tono.franja} px-4 py-3`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-lz-display text-xl font-bold tracking-tight text-lz-charcoal">{titulo}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmandoVaciar(true)}
            disabled={nadaQueVaciar || confirmandoVaciar || cargandoAccion}
            className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal transition-colors hover:border-lz-danger-border hover:bg-lz-danger-surface hover:text-lz-danger disabled:cursor-not-allowed disabled:text-lz-charcoal-muted disabled:hover:border-lz-border disabled:hover:bg-lz-surface"
          >
            {ICONO_PAPELERA}
            Vaciar
          </button>
          {contraer}
        </div>
      </div>

      {confirmandoVaciar && !cargandoAccion && (
        <div
          role="alertdialog"
          aria-labelledby="confirmar-vaciar-titulo"
          className="flex flex-col gap-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface p-3"
        >
          <p id="confirmar-vaciar-titulo" className="text-sm font-semibold text-lz-charcoal">
            ¿Vaciar el {tituloMinusculas}? Se quitarán todas las líneas.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmandoVaciar(false)}
              className="h-11 min-w-[44px] flex-1 rounded-xl border border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal transition-colors hover:bg-lz-oat"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={vaciar}
              className="h-11 min-w-[44px] flex-1 rounded-xl bg-lz-danger px-3 text-sm font-bold text-lz-surface transition-opacity hover:opacity-90"
            >
              Vaciar
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const lista = (
    <div className="min-h-0 flex-1 overflow-y-auto px-4">
      {sinLineas ? (
        <p className="py-10 text-center text-sm font-semibold text-lz-charcoal-muted">
          {textoVacio}
        </p>
      ) : (
        <ul className="divide-y divide-lz-oat">
          {carrito.map((linea) => (
            <LineaPedido
              key={linea.productoId}
              linea={linea}
              despachar={despachar}
              onAviso={mostrarAviso}
              sinPrecio={autoconsumo}
            />
          ))}
          {!autoconsumo &&
            valores.map((v, i) => (
              <LineaValorPedido
                key={`valor-${v.id}`}
                valor={v}
                numero={i + 1}
                deshabilitado={cargandoAccion}
                onQuitar={onQuitarValor ? () => onQuitarValor(v.id) : undefined}
              />
            ))}
        </ul>
      )}
    </div>
  );

  const cajaTotal = autoconsumo ? (
    <div className="flex flex-col gap-1 rounded-2xl border border-lz-amber bg-lz-surface p-3.5 shadow-lz-soft">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-lz-charcoal-muted">Artículos</span>
        <span className="font-lz-display text-3xl font-extrabold tracking-tight text-lz-charcoal tabular-nums">
          {articulos}
        </span>
      </div>
      <p className="text-xs text-lz-charcoal-muted">Valor de referencia: {totalTexto} · no se cobra</p>
    </div>
  ) : (
    <div className="flex items-center justify-between rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft">
      <div className="flex flex-col">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-lz-charcoal-muted">Total</span>
        <span className="text-xs font-semibold text-lz-amber">{resumenCantidad}</span>
      </div>
      <span className="font-lz-display text-3xl font-extrabold tracking-tight text-lz-sage-dark tabular-nums">
        {totalTexto}
      </span>
    </div>
  );

  const pie = (
    <div className={`flex shrink-0 flex-col gap-3 border-t ${tono.franja} p-4`}>
      {cajaTotal}
      {!autoconsumo && !cargandoAccion && digitadoCalculadora > 0 && (
        <p className="text-center text-xs font-semibold text-lz-charcoal-muted">
          Al cobrar se suma también {formatCurrency(digitadoCalculadora)} digitado.
        </p>
      )}
      {nota && <p className="text-xs font-semibold text-lz-charcoal-muted">{nota}</p>}
      {avisoErrorDirecto}
      {botonCobrar('h-16 w-full')}
    </div>
  );

  // Escritorio: panel lateral siempre visible (también si se cruza el quiebre con el Carrito expandido).
  if (layout.modo === 'escritorio') {
    return (
      <aside
        aria-label={titulo}
        className={`flex h-full shrink-0 flex-col overflow-hidden border-l ${tono.contenedor}`}
        style={{ width: layout.anchoCarrito }}
      >
        {encabezado()}
        {selectorMetodo}
        {regionAviso}
        {lista}
        {pie}
      </aside>
    );
  }

  // Móvil expandido: hoja sobre la cuadrícula hasta altoCarritoExpandido.
  if (expandido) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-lz-charcoal/40"
          onClick={() => onExpandir(false)}
          aria-hidden="true"
        />
        <section
          aria-label={titulo}
          className={`fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t ${tono.contenedor} shadow-lz-float`}
          style={{ maxHeight: layout.altoCarritoExpandido }}
        >
          {encabezado(
            <button
              type="button"
              onClick={() => onExpandir(false)}
              aria-label={`Contraer ${tituloMinusculas}`}
              className={`inline-flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-xl border border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal transition-colors ${tono.hoverContraer}`}
            >
              {ICONO_CONTRAER}
              Contraer
            </button>
          )}
          {selectorMetodo}
          {regionAviso}
          {lista}
          {pie}
        </section>
      </>
    );
  }

  // Móvil contraído: barra inferior fija con total y artículos (autoconsumo: sin pesos).
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-col ${tono.barraMovil} shadow-lz-float`}
      aria-label={titulo}
      role="region"
    >
      {avisoErrorDirecto && <div className="px-3 pt-3">{avisoErrorDirecto}</div>}
      {aviso && (
        <p
          role="status"
          aria-live="polite"
          className="mx-3 mt-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-semibold text-lz-danger"
        >
          {aviso.texto}
        </p>
      )}
      <div className="flex items-center gap-2 px-3" style={{ height: MEDIDAS.barraMovil }}>
        <button
          type="button"
          onClick={() => onExpandir(true)}
          aria-label={
            autoconsumo
              ? `Ver ${tituloMinusculas}: ${resumenCantidad}`
              : `Ver ${tituloMinusculas}: ${resumenCantidad}, total ${totalTexto}`
          }
          className={`flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left transition-colors ${tono.hoverBarra}`}
        >
          <span className="flex min-w-0 flex-col">
            {autoconsumo ? (
              <span className="truncate font-lz-display text-xl font-extrabold leading-tight text-lz-charcoal">
                {titulo}
              </span>
            ) : (
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate font-lz-display text-xl font-extrabold leading-tight text-lz-sage-dark tabular-nums">
                  {totalTexto}
                </span>
                {mostrarSelectorMetodo && metodoSeleccionado && (
                  <span className="shrink-0 rounded-md bg-lz-sage-light px-1.5 text-xs font-bold text-lz-sage">
                    {metodoSeleccionado.nombre}
                  </span>
                )}
              </span>
            )}
            <span className="truncate text-xs font-semibold text-lz-charcoal-muted">
              {resumenCantidad}
            </span>
          </span>
          <span className={`ml-auto flex shrink-0 items-center gap-1 text-sm font-semibold ${tono.textoVer}`}>
            Ver {tituloMinusculas}
            {ICONO_EXPANDIR}
          </span>
        </button>
        {botonCobrar('h-12')}
      </div>
    </div>
  );
}

export default PanelCarrito;
