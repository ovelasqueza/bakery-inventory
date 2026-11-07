'use client';

// Popup rápido en Caja para productos con venta por dinero ($) y/o promoción combinable.
// Diseño limpio con texto mínimo: "¿Cuánto pide en pesos?" y "¿Cuántas unidades pide?".

import { useState } from 'react';
import { ImagenProducto } from '@/components/caja/ImagenProducto';
import type { ProductoCaja } from '@/lib/caja/busqueda';
import {
  CANTIDAD_MAX,
  calcularUnidadesPorMonto,
  descomponerCantidadConPromo,
} from '@/lib/caja/carrito';
import { formatCurrency } from '@/lib/utils';

const MONTOS_RAPIDOS = [3000, 4000, 5000, 6000, 10000] as const;
const UNIDADES_RAPIDAS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

export interface DialogoVentaPorMontoProps {
  producto: ProductoCaja | null;
  /** Agrega N unidades del producto y cierra el diálogo. */
  onElegir: (producto: ProductoCaja, cantidad: number) => void;
  onCerrar: () => void;
}

export function DialogoVentaPorMonto({ producto, onElegir, onCerrar }: DialogoVentaPorMontoProps) {
  const [otroMontoTexto, setOtroMontoTexto] = useState('');

  if (!producto) return null;

  const precio = Math.max(1, producto.precio);
  const promo =
    producto.promocion && producto.promocion.cantidad > 0 && producto.promocion.precio > 0
      ? producto.promocion
      : null;

  const montosDisponibles = MONTOS_RAPIDOS.filter((m) => m >= precio);

  const otroMontoLimpio = otroMontoTexto.replace(/\D/g, '');
  const otroMonto = otroMontoLimpio ? Number(otroMontoLimpio) : 0;
  const otroMontoValido = otroMonto >= precio && otroMonto <= precio * CANTIDAD_MAX;
  const resultadoOtro = otroMontoValido
    ? calcularUnidadesPorMonto(otroMonto, precio, promo)
    : null;

  const elegirUnidades = (cantidad: number) => {
    const cantSegura = Math.max(1, Math.min(CANTIDAD_MAX, Math.round(cantidad)));
    onElegir(producto, cantSegura);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Venta rápida de ${producto.nombre}`}
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/55 p-3 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-lz-border bg-lz-linen shadow-xl"
      >
        {/* Encabezado limpio */}
        <header className="flex items-center justify-between gap-3 border-b border-lz-border bg-lz-surface px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-lz-border bg-lz-oat">
              <ImagenProducto nombre={producto.nombre} imagenUrl={producto.imagenUrl} />
            </div>
            <div className="flex min-w-0 items-baseline gap-2.5">
              <h2 className="truncate font-lz-display text-lg font-bold text-lz-charcoal">
                {producto.nombre}
              </h2>
              <span className="shrink-0 text-sm font-semibold text-lz-sage">
                {formatCurrency(precio)} c/u
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="inline-flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-xl border border-lz-border bg-lz-surface text-lz-charcoal hover:bg-lz-oat"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto p-4 sm:p-5">
          {/* Sección 1: ¿Cuánto pide en pesos? */}
          <section className="flex flex-col gap-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-lz-charcoal-muted">
              ¿Cuánto pide en pesos?
            </h3>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {montosDisponibles.map((monto) => {
                const calc = calcularUnidadesPorMonto(monto, precio, promo);

                if (calc.exacto) {
                  const tienePromo = calc.promos > 0;
                  return (
                    <button
                      key={monto}
                      type="button"
                      onClick={() => elegirUnidades(calc.unidades)}
                      className={`flex min-h-[78px] flex-col items-start justify-between rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] ${
                        tienePromo
                          ? 'border-lz-amber bg-lz-amber-light hover:bg-lz-amber/20'
                          : 'border-lz-sage bg-lz-surface hover:bg-lz-sage-light'
                      }`}
                    >
                      <span className="font-lz-display text-base font-extrabold text-lz-charcoal">
                        {formatCurrency(monto)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold text-lz-surface ${
                          tienePromo ? 'bg-lz-amber' : 'bg-lz-sage'
                        }`}
                      >
                        {calc.unidades} und
                      </span>
                    </button>
                  );
                }

                const totalInf = descomponerCantidadConPromo(calc.unidadesInf, precio, promo).total;
                const totalSup = descomponerCantidadConPromo(calc.unidadesSup, precio, promo).total;

                return (
                  <div
                    key={monto}
                    className="col-span-2 flex min-h-[78px] flex-col justify-between gap-1.5 rounded-2xl border-2 border-lz-border bg-lz-surface p-2.5 sm:col-span-1"
                  >
                    <span className="px-0.5 font-lz-display text-base font-extrabold text-lz-charcoal">
                      {formatCurrency(monto)}
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => elegirUnidades(calc.unidadesInf)}
                        className="flex min-h-[40px] flex-col items-center justify-center rounded-xl border border-lz-sage bg-lz-sage-light px-1 py-1 text-center transition-colors hover:bg-lz-sage hover:text-lz-surface"
                      >
                        <span className="text-xs font-extrabold">{calc.unidadesInf} und</span>
                        <span className="text-[10px] font-semibold">{formatCurrency(totalInf)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => elegirUnidades(calc.unidadesSup)}
                        className="flex min-h-[40px] flex-col items-center justify-center rounded-xl border border-lz-border bg-lz-oat px-1 py-1 text-center text-lz-charcoal transition-colors hover:border-lz-sage hover:bg-lz-sage-light"
                      >
                        <span className="text-xs font-extrabold">{calc.unidadesSup} und</span>
                        <span className="text-[10px] font-semibold">{formatCurrency(totalSup)}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Campo rápido para otro valor en pesos */}
            <div className="flex flex-col gap-2 rounded-2xl border border-lz-border bg-lz-surface p-2.5 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2">
                <span className="pl-1 text-sm font-bold text-lz-charcoal-muted">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otroMontoTexto}
                  onChange={(e) => setOtroMontoTexto(e.target.value.replace(/\D/g, ''))}
                  placeholder="Otro valor en pesos"
                  className="min-h-[40px] w-full rounded-xl border border-lz-border bg-lz-linen px-3 text-sm font-semibold text-lz-charcoal focus:border-lz-sage focus:outline-none"
                />
              </div>
              {resultadoOtro && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {resultadoOtro.exacto ? (
                    <button
                      type="button"
                      onClick={() => elegirUnidades(resultadoOtro.unidades)}
                      className={`min-h-[40px] rounded-xl px-3.5 text-xs font-bold text-lz-surface ${
                        resultadoOtro.promos > 0
                          ? 'bg-lz-amber hover:opacity-90'
                          : 'bg-lz-sage hover:bg-lz-sage-dark'
                      }`}
                    >
                      {resultadoOtro.unidades} und ({formatCurrency(otroMonto)})
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => elegirUnidades(resultadoOtro.unidadesInf)}
                        className="min-h-[40px] rounded-xl bg-lz-sage px-3 text-xs font-bold text-lz-surface hover:bg-lz-sage-dark"
                      >
                        {resultadoOtro.unidadesInf} und (
                        {formatCurrency(
                          descomponerCantidadConPromo(resultadoOtro.unidadesInf, precio, promo).total
                        )}
                        )
                      </button>
                      <button
                        type="button"
                        onClick={() => elegirUnidades(resultadoOtro.unidadesSup)}
                        className="min-h-[40px] rounded-xl border border-lz-sage bg-lz-sage-light px-3 text-xs font-bold text-lz-sage hover:bg-lz-sage hover:text-lz-surface"
                      >
                        {resultadoOtro.unidadesSup} und (
                        {formatCurrency(
                          descomponerCantidadConPromo(resultadoOtro.unidadesSup, precio, promo).total
                        )}
                        )
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Sección 2: ¿Cuántas unidades pide? */}
          <section className="flex flex-col gap-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-lz-charcoal-muted">
              ¿Cuántas unidades pide?
            </h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {UNIDADES_RAPIDAS.map((cant) => {
                const desglose = descomponerCantidadConPromo(cant, precio, promo);
                const aplicaPromo = desglose.promos > 0;
                return (
                  <button
                    key={cant}
                    type="button"
                    onClick={() => elegirUnidades(cant)}
                    className={`flex min-h-[58px] flex-col items-center justify-center rounded-2xl border px-2 py-2 text-center transition-colors active:scale-95 ${
                      aplicaPromo
                        ? 'border-2 border-lz-amber bg-lz-amber-light hover:bg-lz-amber/20'
                        : 'border-lz-border bg-lz-surface hover:border-lz-sage hover:bg-lz-sage-light'
                    }`}
                  >
                    <span className="font-lz-display text-base font-extrabold text-lz-charcoal">
                      {cant} und
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        aplicaPromo ? 'font-extrabold text-lz-amber' : 'text-lz-charcoal-muted'
                      }`}
                    >
                      {formatCurrency(desglose.total)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
export default DialogoVentaPorMonto;
