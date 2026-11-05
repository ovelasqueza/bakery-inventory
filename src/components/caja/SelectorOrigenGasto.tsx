'use client';

// De dónde sale el dinero de un gasto: Cajón, una Parte de la caja mayor o Combinado (Req 6.1, 6.2, 6.3, 8.6).
// El Cajón no muestra cifras (cierre a ciegas); las Partes muestran su saldo disponible.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ParteCajaMayor } from '@/lib/api/cajaMayor';
import type { OrigenGasto } from '@/lib/api/gastos';
import { formatCurrency } from '@/lib/utils';

/** Clave interna del Cajón (en `OrigenGasto` es `parteId = null`). */
const CAJON = '__cajon__';
const COMBINADO = '__combinado__';

interface Fuente {
  clave: string;
  parteId: string | null;
  nombre: string;
  detalle: string;
  /** `null` para el Cajón: no se muestra cuánto hay. */
  saldo: number | null;
}

export interface SelectorOrigenGastoProps {
  /** Valor total del gasto; `null` mientras no sea un entero válido. */
  valor: number | null;
  /** Saldos de la caja mayor (Efectivo primero). */
  partes: ParteCajaMayor[];
  /** Con turno se ofrece el Cajón; los gastos sin turno salen solo de Partes. */
  permitirCajon: boolean;
  /** Orígenes actuales; se usan solo para el estado inicial. Para reiniciar, cambie la `key`. */
  value: OrigenGasto[];
  onChange: (origenes: OrigenGasto[]) => void;
  error?: string;
  /** Deshabilita los controles mientras se guarda. */
  deshabilitado?: boolean;
}

function claveDe(parteId: string | null): string {
  return parteId === null ? CAJON : parteId;
}

function textoInicial(value: OrigenGasto[]): Record<string, string> {
  const textos: Record<string, string> = {};
  if (value.length > 1) for (const o of value) textos[claveDe(o.parteId)] = String(o.valor);
  return textos;
}

/** Texto de un campo del Combinado → valor; vacío = sin valor; texto no entero = NaN (lo rechaza `validarOrigenes`). */
function leerValor(texto: string): number | null {
  const t = texto.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

export function SelectorOrigenGasto({
  valor,
  partes,
  permitirCajon,
  value,
  onChange,
  error,
  deshabilitado = false,
}: SelectorOrigenGastoProps) {
  const idGrupo = useId();
  const idError = useId();

  const fuentes = useMemo<Fuente[]>(() => {
    const lista: Fuente[] = [];
    if (permitirCajon) {
      lista.push({ clave: CAJON, parteId: null, nombre: 'Cajón', detalle: 'Efectivo del turno', saldo: null });
    }
    for (const p of partes) {
      // Partes inactivas sin saldo no sirven como origen.
      if (!p.activo && p.saldo <= 0) continue;
      lista.push({
        clave: p.parteId,
        parteId: p.parteId,
        nombre: p.metodoPagoId === null ? 'Efectivo' : p.nombre,
        detalle: 'Caja mayor',
        saldo: p.saldo,
      });
    }
    return lista;
  }, [partes, permitirCajon]);

  const [modo, setModo] = useState<string>(() => {
    if (value.length > 1) return COMBINADO;
    if (value.length === 1) return claveDe(value[0].parteId);
    return permitirCajon ? CAJON : '';
  });
  const [textos, setTextos] = useState<Record<string, string>>(() => textoInicial(value));

  // Sin selección válida (p. ej. sin Cajón y las Partes llegaron después): primera fuente disponible.
  const modoEfectivo =
    modo === COMBINADO || fuentes.some((f) => f.clave === modo) ? modo : fuentes[0]?.clave ?? '';
  const combinado = modoEfectivo === COMBINADO;

  const origenes = useMemo<OrigenGasto[]>(() => {
    if (combinado) {
      const lista: OrigenGasto[] = [];
      for (const f of fuentes) {
        const v = leerValor(textos[f.clave] ?? '');
        if (v !== null) lista.push({ parteId: f.parteId, valor: v });
      }
      return lista;
    }
    const f = fuentes.find((x) => x.clave === modoEfectivo);
    return f ? [{ parteId: f.parteId, valor: valor ?? 0 }] : [];
  }, [combinado, fuentes, textos, modoEfectivo, valor]);

  // Avisa al padre solo cuando los orígenes cambian de verdad.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const ultimo = useRef<string | null>(null);
  useEffect(() => {
    const firma = JSON.stringify(origenes);
    if (firma === ultimo.current) return;
    ultimo.current = firma;
    onChangeRef.current(origenes);
  }, [origenes]);

  const suma = origenes.reduce((s, o) => (Number.isFinite(o.valor) ? s + o.valor : s), 0);
  const diferencia = valor === null ? null : valor - suma;
  const puedeCombinar = fuentes.length >= 2;

  const claseBoton = (elegido: boolean) =>
    `flex min-h-[56px] min-w-[44px] flex-col items-start justify-center rounded-2xl border-2 px-4 py-2 text-left transition-colors disabled:opacity-50 ${
      elegido
        ? 'border-lz-sage bg-lz-sage text-lz-surface'
        : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
    }`;

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? idError : undefined}>
      <legend className="mb-1 text-sm font-medium text-lz-charcoal-muted">¿De dónde sale el dinero?</legend>

      {fuentes.length === 0 ? (
        <p className="text-sm text-lz-charcoal-muted">No hay partes de caja mayor disponibles.</p>
      ) : (
        <div id={idGrupo} className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Origen del gasto">
          {fuentes.map((f) => {
            const elegido = modoEfectivo === f.clave;
            const noAlcanza = elegido && f.saldo !== null && valor !== null && valor > f.saldo;
            return (
              <button
                key={f.clave}
                type="button"
                aria-pressed={elegido}
                disabled={deshabilitado}
                onClick={() => setModo(f.clave)}
                className={claseBoton(elegido)}
              >
                <span className="text-base font-semibold leading-tight">{f.nombre}</span>
                <span className={`text-xs ${elegido ? 'text-lz-surface/90' : 'text-lz-charcoal-muted'}`}>
                  {f.saldo === null ? f.detalle : `${f.detalle} · ${formatCurrency(f.saldo)}`}
                </span>
                {noAlcanza && <span className="text-xs font-bold">No alcanza</span>}
              </button>
            );
          })}
          {puedeCombinar && (
            <button
              type="button"
              aria-pressed={combinado}
              disabled={deshabilitado}
              onClick={() => setModo(COMBINADO)}
              className={claseBoton(combinado)}
            >
              <span className="text-base font-semibold leading-tight">Combinado</span>
              <span className={`text-xs ${combinado ? 'text-lz-surface/90' : 'text-lz-charcoal-muted'}`}>
                Varias fuentes
              </span>
            </button>
          )}
        </div>
      )}

      {combinado && (
        <div className="flex flex-col gap-2 rounded-2xl border border-lz-border bg-lz-linen p-3">
          {fuentes.map((f) => {
            const idCampo = `${idGrupo}-${f.clave}`;
            const v = leerValor(textos[f.clave] ?? '');
            const noAlcanza = f.saldo !== null && v !== null && Number.isFinite(v) && v > f.saldo;
            return (
              <div key={f.clave} className="flex items-center gap-3">
                <label htmlFor={idCampo} className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-lz-charcoal">{f.nombre}</span>
                  <span className={`block text-xs ${noAlcanza ? 'font-bold text-lz-danger' : 'text-lz-charcoal-muted'}`}>
                    {f.saldo === null
                      ? f.detalle
                      : `${f.detalle} · disponible ${formatCurrency(f.saldo)}${noAlcanza ? ' · no alcanza' : ''}`}
                  </span>
                </label>
                <input
                  id={idCampo}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  disabled={deshabilitado}
                  value={textos[f.clave] ?? ''}
                  onChange={(e) => setTextos((t) => ({ ...t, [f.clave]: e.target.value }))}
                  className="min-h-[48px] w-36 rounded-2xl border-2 border-lz-border bg-lz-surface px-3 text-right text-lg font-semibold tabular-nums text-lz-charcoal placeholder:text-lz-charcoal-muted focus:border-lz-sage focus:outline-none"
                />
              </div>
            );
          })}
          <p
            aria-live="polite"
            className={`text-right text-sm font-bold tabular-nums ${
              diferencia === 0 ? 'text-lz-sage-dark' : diferencia === null ? 'text-lz-charcoal-muted' : 'text-lz-danger'
            }`}
          >
            {diferencia === null
              ? 'Escriba primero el valor del gasto.'
              : diferencia > 0
                ? `Falta ${formatCurrency(diferencia)}`
                : diferencia < 0
                  ? `Sobra ${formatCurrency(-diferencia)}`
                  : 'Los valores suman el total.'}
          </p>
        </div>
      )}

      {error && (
        <p id={idError} role="alert" className="text-sm font-medium text-lz-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export default SelectorOrigenGasto;
