'use client';

// Panel de la Lista_Valores de la Calculadora (Req 4.4-4.6, 5.3).
// Mismo esquema que PanelCarrito: lateral derecho en escritorio; barra inferior fija en móvil
// que se expande sobre la Calculadora. Arriba de la lista va el Selector_Metodo (Req 5.1, 5.3);
// "Cobrar" registra de una (Req 6.1) y, mientras guarda, no se edita ni se cambia el método (Req 6.7).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { MetodoPagoParam } from '@/lib/api/parametros';
import { MEDIDAS, type LayoutCaja } from '@/lib/caja/layout';
import {
  totalValores,
  type AccionCalculadora,
  type AvisoCalculadora,
  type EstadoCalculadora,
  type ValorLista,
} from '@/lib/caja/calculadora';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';

/** Error del cobro directo (misma forma que en useCobroDirecto). */
export type ErrorCobroDirecto = null | { tipo: 'sin_conexion' } | { tipo: 'mensaje'; texto: string };

interface PanelValoresProps {
  estado: EstadoCalculadora;
  layout: LayoutCaja;
  despachar: (accion: AccionCalculadora) => { estado: EstadoCalculadora; aviso?: AvisoCalculadora };
  onCobrar: () => void;
  /** Métodos de pago; solo se muestran los activos. */
  metodos: MetodoPagoParam[];
  /** Metodo_Escogido. */
  metodoId: string | null;
  onMetodo: (id: string) => void;
  /** La Venta_Por_Valor se está registrando: sin quitar, borrar, cambiar método ni cobrar. */
  registrando: boolean;
  /** Error del último intento de cobro. */
  error: ErrorCobroDirecto;
  /** Reintento tras "Sin conexión". */
  onReintentar: () => void;
  /** Móvil: el panel está expandido sobre la Calculadora. */
  expandido: boolean;
  onExpandir: (expandido: boolean) => void;
}

function textoValores(n: number) {
  return `${n} ${n === 1 ? 'valor' : 'valores'}`;
}

function Icono({ children }: { children: ReactNode }) {
  return (
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

const ICONO_QUITAR = (
  <Icono>
    <path d="M6 6l12 12M18 6L6 18" />
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

function FilaValor({
  valor,
  numero,
  deshabilitado,
  onQuitar,
}: {
  valor: ValorLista;
  numero: number;
  deshabilitado: boolean;
  onQuitar: () => void;
}) {
  const texto = formatCurrency(valor.valor);
  return (
    <li className="flex min-h-[56px] items-center gap-3 py-2">
      <span className="w-8 shrink-0 text-right text-sm font-bold text-lz-charcoal-muted tabular-nums">{numero}.</span>
      <span className="min-w-0 flex-1 truncate font-lz-display text-xl font-bold text-lz-charcoal tabular-nums">
        {texto}
      </span>
      <button
        type="button"
        onClick={onQuitar}
        disabled={deshabilitado}
        aria-label={`Quitar valor ${numero}: ${texto}`}
        className="inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-xl border border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal-muted transition-colors hover:border-lz-danger-border hover:bg-lz-danger-surface hover:text-lz-danger disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-lz-border disabled:hover:bg-lz-surface disabled:hover:text-lz-charcoal-muted"
      >
        {ICONO_QUITAR}
        Quitar
      </button>
    </li>
  );
}

export function PanelValores({
  estado,
  layout,
  despachar,
  onCobrar,
  metodos,
  metodoId,
  onMetodo,
  registrando,
  error,
  onReintentar,
  expandido,
  onExpandir,
}: PanelValoresProps) {
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);
  const finLista = useRef<HTMLLIElement>(null);

  const { valores, digitado } = estado;
  const total = totalValores(valores);
  const totalTexto = formatCurrency(total);
  const vacio = valores.length === 0;
  const nadaQueBorrar = vacio && digitado === 0;
  const activos = metodos.filter((m) => m.activo);
  const metodo = activos.find((m) => m.id === metodoId) ?? null;
  const puedeCobrar = !registrando && metodo !== null && (!vacio || digitado > 0);

  // Sin nada que borrar (o mientras se registra) no hay confirmación pendiente.
  useEffect(() => {
    if (nadaQueBorrar || registrando) setConfirmandoBorrar(false);
  }, [nadaQueBorrar, registrando]);

  // Al agregar un valor, la lista baja hasta el último.
  const cantidad = valores.length;
  useEffect(() => {
    if (cantidad > 0) finLista.current?.scrollIntoView({ block: 'nearest' });
  }, [cantidad]);

  const borrarTodo = () => {
    despachar({ tipo: 'vaciar' });
    setConfirmandoBorrar(false);
  };

  const botonCobrar = (alto: string) => (
    <button
      type="button"
      onClick={onCobrar}
      disabled={!puedeCobrar}
      aria-busy={registrando || undefined}
      className={`flex ${alto} min-w-[44px] shrink-0 items-center justify-center rounded-2xl border border-lz-sage-medium bg-lz-sage-dark px-5 font-lz-display text-lg font-bold tracking-wide text-lz-surface shadow-lz-soft transition hover:bg-lz-sage active:scale-[0.98] disabled:cursor-not-allowed disabled:border-lz-border disabled:bg-lz-sand disabled:text-lz-charcoal-muted disabled:active:scale-100`}
    >
      {registrando ? 'Guardando…' : 'Cobrar'}
    </button>
  );

  // Aviso del último intento, encima de "Cobrar" (Req 6.5, 6.10, 6.12, 6.13).
  const avisoError = !error ? null : error.tipo === 'sin_conexion' ? (
    <AvisoSinConexion onReintentar={onReintentar} reintentando={registrando} />
  ) : (
    <p
      role="alert"
      className="rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-semibold text-lz-danger"
    >
      {error.texto}
    </p>
  );

  // Selector_Metodo: un botón por método activo, arriba de la lista (Req 5.1, 5.3).
  const selectorMetodo = (
    <div className="shrink-0 border-b border-lz-border bg-lz-surface px-4 py-3">
      <p
        id="selector-metodo-valores"
        className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-lz-charcoal-muted"
      >
        Método de pago
      </p>
      {activos.length === 0 ? (
        <p className="text-sm font-semibold text-lz-danger">No hay métodos de pago activos.</p>
      ) : (
        <div role="group" aria-labelledby="selector-metodo-valores" className="flex flex-wrap gap-2">
          {activos.map((m) => {
            const escogido = m.id === metodo?.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onMetodo(m.id)}
                disabled={registrando}
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
  );

  const encabezado = (contraer?: ReactNode) => (
    <div className="flex shrink-0 flex-col gap-2 border-b border-lz-border bg-lz-oat px-4 py-3">
      <div className="flex min-h-[44px] items-center justify-between gap-2">
        <h2 className="font-lz-display text-xl font-bold tracking-tight text-lz-charcoal">Valores</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmandoBorrar(true)}
            disabled={nadaQueBorrar || confirmandoBorrar || registrando}
            className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal transition-colors hover:border-lz-danger-border hover:bg-lz-danger-surface hover:text-lz-danger disabled:cursor-not-allowed disabled:text-lz-charcoal-muted disabled:hover:border-lz-border disabled:hover:bg-lz-surface"
          >
            {ICONO_PAPELERA}
            Borrar todo
          </button>
          {contraer}
        </div>
      </div>

      {confirmandoBorrar && !registrando && (
        <div
          role="alertdialog"
          aria-labelledby="confirmar-borrar-valores-titulo"
          className="flex flex-col gap-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface p-3"
        >
          <p id="confirmar-borrar-valores-titulo" className="text-sm font-semibold text-lz-charcoal">
            ¿Borrar todos los valores? También se borra el valor digitado.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmandoBorrar(false)}
              className="h-11 min-w-[44px] flex-1 rounded-xl border border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal transition-colors hover:bg-lz-oat"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={borrarTodo}
              className="h-11 min-w-[44px] flex-1 rounded-xl bg-lz-danger px-3 text-sm font-bold text-lz-surface transition-opacity hover:opacity-90"
            >
              Borrar todo
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const lista = (
    <div className="min-h-0 flex-1 overflow-y-auto px-4">
      {vacio ? (
        <p className="py-10 text-center text-sm font-semibold text-lz-charcoal-muted">
          Escriba un valor y toque &quot;Agregar&quot;.
        </p>
      ) : (
        <ol className="divide-y divide-lz-oat" aria-label="Lista de valores">
          {valores.map((v, i) => (
            <FilaValor
              key={v.id}
              valor={v}
              numero={i + 1}
              deshabilitado={registrando}
              onQuitar={() => despachar({ tipo: 'quitar', id: v.id })}
            />
          ))}
          <li ref={finLista} aria-hidden="true" className="h-0 border-0" />
        </ol>
      )}
    </div>
  );

  const pie = (
    <div className="flex shrink-0 flex-col gap-3 border-t border-lz-border bg-lz-oat p-4">
      <div
        className="flex items-center justify-between rounded-2xl border border-lz-border bg-lz-surface p-3.5 shadow-lz-soft"
        aria-live="polite"
      >
        <div className="flex flex-col">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-lz-charcoal-muted">Total</span>
          <span className="text-xs font-semibold text-lz-amber">{textoValores(valores.length)}</span>
        </div>
        <span className="font-lz-display text-3xl font-extrabold tracking-tight text-lz-sage-dark tabular-nums">
          {totalTexto}
        </span>
      </div>
      {!registrando && digitado > 0 && (
        <p className="text-center text-xs font-semibold text-lz-charcoal-muted">
          Al cobrar se suma también {formatCurrency(digitado)} digitado.
        </p>
      )}
      {avisoError}
      {botonCobrar('h-16 w-full')}
    </div>
  );

  if (layout.modo === 'escritorio') {
    return (
      <aside
        aria-label="Valores"
        className="flex h-full shrink-0 flex-col overflow-hidden border-l border-lz-border bg-lz-surface"
        style={{ width: layout.anchoCarrito }}
      >
        {encabezado()}
        {selectorMetodo}
        {lista}
        {pie}
      </aside>
    );
  }

  // Móvil expandido: hoja sobre la Calculadora hasta altoCarritoExpandido.
  if (expandido) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-lz-charcoal/40" onClick={() => onExpandir(false)} aria-hidden="true" />
        <section
          aria-label="Valores"
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t border-lz-border bg-lz-surface shadow-lz-float"
          style={{ maxHeight: layout.altoCarritoExpandido }}
        >
          {encabezado(
            <button
              type="button"
              onClick={() => onExpandir(false)}
              aria-label="Contraer valores"
              className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-xl border border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal transition-colors hover:bg-lz-sage-light hover:text-lz-sage"
            >
              {ICONO_CONTRAER}
              Contraer
            </button>
          )}
          {selectorMetodo}
          {lista}
          {pie}
        </section>
      </>
    );
  }

  // Móvil contraído: barra inferior fija con total, método escogido y número de valores.
  // El selector no cabe aquí; se escoge en el panel expandido.
  const nombreMetodo = metodo?.nombre ?? 'Sin método';
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-lz-border bg-lz-surface shadow-lz-float"
      aria-label="Valores"
      role="region"
    >
      {avisoError && <div className="px-3 pt-3">{avisoError}</div>}
      <div className="flex items-center gap-2 px-3" style={{ height: MEDIDAS.barraMovil }}>
        <button
          type="button"
          onClick={() => onExpandir(true)}
          aria-label={`Ver valores: ${textoValores(valores.length)}, total ${totalTexto}, método ${nombreMetodo}`}
          className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-lz-sage-light"
        >
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-lz-display text-xl font-extrabold leading-tight text-lz-sage-dark tabular-nums">
                {totalTexto}
              </span>
              <span className="shrink-0 rounded-md bg-lz-sage-light px-1.5 text-xs font-bold text-lz-sage">
                {nombreMetodo}
              </span>
            </span>
            <span className="truncate text-xs font-semibold text-lz-charcoal-muted">{textoValores(valores.length)}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-sm font-semibold text-lz-sage">
            Ver valores
            {ICONO_EXPANDIR}
          </span>
        </button>
        {botonCobrar('h-12')}
      </div>
    </div>
  );
}

export default PanelValores;
