'use client';

// Cierre a ciegas: efectivo contado y Persona_Caja (sin base para el siguiente turno).
// No muestra esperado, totales ni diferencia (Req 1.1-1.3, 1.7, 1.8).

import { useId, useRef, useState, type FormEvent } from 'react';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';
import { SelectorPersona } from '@/components/caja/SelectorPersona';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import { ErrorApp } from '@/lib/api/errores';
import type { PersonaCajaParam } from '@/lib/api/parametros';
import { cerrarTurno, type Cierre } from '@/lib/api/turnos';
import { conMiles, validarEnteroEnRango, validarNombrePersona } from '@/lib/caja/validacion';
import { hora12 } from '@/lib/fechas/bogota';
import { formatCurrency } from '@/lib/utils';

const CONTADO_MAX = 99_999_999;

interface CierreTurnoProps {
  turnoId: string;
  personas: PersonaCajaParam[];
  /** Prop opcional mantenida por compatibilidad (la base ahora siempre se guarda como 0). */
  baseDefecto?: number;
  /** Vuelve a ventas sin registrar nada. */
  onCancelar: () => void;
  onCerrado: (cierre: Cierre) => void;
  /** Otro dispositivo cerró primero; quien llama muestra la apertura (Req 1.7). */
  onYaCerrado: (info: { cerradoPor: string; cerradoEn: string }) => void;
  /** Pide al Agente_Cajon abrir el cajón; quien llama decide si está activado y muestra sus avisos. */
  abrirCajon: () => Promise<void>;
}

const MENSAJES_NOMBRE = {
  VACIO: 'Escriba o escoja quién cierra el turno.',
  LARGO: 'El nombre puede tener hasta 60 letras.',
} as const;

const MENSAJES_CONTADO = {
  VACIO: 'Escriba el efectivo contado (puede ser 0).',
  NO_ENTERO: 'Escriba solo números enteros, sin comas ni decimales.',
  RANGO: `El efectivo debe estar entre ${formatCurrency(0)} y ${formatCurrency(CONTADO_MAX)}.`,
} as const;

export function CierreTurno({
  turnoId,
  personas,
  onCancelar,
  onCerrado,
  onYaCerrado,
  abrirCajon,
}: CierreTurnoProps) {
  const idTitulo = useId();
  const idContado = useId();
  const idErrorContado = useId();

  const [contado, setContado] = useState('');
  const [persona, setPersona] = useState('');
  const [errorContado, setErrorContado] = useState<string | null>(null);
  const [errorPersona, setErrorPersona] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<'SIN_CONEXION' | 'OTRO' | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const [yaCerrado, setYaCerrado] = useState<{ cerradoPor: string; cerradoEn: string } | null>(null);

  // Misma clave mientras no cambien contado y persona: un reintento no registra otro cierre (Req 1.8).
  const firma = JSON.stringify([turnoId, contado.trim(), persona.trim()]);
  const { clave, renovar } = useClaveIdempotente(firma);

  const enviar = async () => {
    if (enviandoRef.current) return;

    const monto = validarEnteroEnRango(contado, 0, CONTADO_MAX);
    const nombre = validarNombrePersona(persona);

    setErrorContado(monto.ok ? null : MENSAJES_CONTADO[monto.error]);
    setErrorPersona(nombre.ok ? null : MENSAJES_NOMBRE[nombre.error]);
    if (!monto.ok || !nombre.ok) return;

    enviandoRef.current = true;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const r = await cerrarTurno(turnoId, clave, nombre.valor, monto.valor, 0);
      renovar();
      if (r.resultado === 'ya_cerrado') {
        setYaCerrado({ cerradoPor: r.cerradoPor, cerradoEn: r.cerradoEn });
        return;
      }
      void abrirCajon().catch(() => undefined);
      onCerrado(r.cierre);
    } catch (e) {
      setErrorEnvio(e instanceof ErrorApp && e.codigo === 'SIN_CONEXION' ? 'SIN_CONEXION' : 'OTRO');
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  const alEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void enviar();
  };

  const cambiarContado = (valor: string) => {
    setContado(valor);
    if (errorContado) setErrorContado(null);
    setErrorEnvio(null);
  };

  const cambiarPersona = (valor: string) => {
    setPersona(valor);
    if (errorPersona) setErrorPersona(null);
    setErrorEnvio(null);
  };

  const claseCampo = (error: string | null) =>
    `min-h-[64px] w-full rounded-2xl border-2 bg-lz-surface py-3 pl-12 pr-4 text-right font-lz-display text-3xl font-bold text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none disabled:opacity-50 ${
      error ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
    }`;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-lz-linen font-lz-sans text-lz-charcoal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
    >
      <header className="flex items-center justify-between gap-3 border-b border-lz-border bg-lz-surface px-4 py-3 shadow-lz-soft">
        <h2 id={idTitulo} className="font-lz-display text-2xl font-bold text-lz-charcoal">
          Cerrar turno
        </h2>
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          className="min-h-[48px] min-w-[48px] rounded-2xl border-2 border-lz-border bg-lz-surface px-5 text-base font-semibold text-lz-charcoal transition-colors hover:border-lz-sage-medium hover:bg-lz-sage-light disabled:opacity-50"
        >
          Cancelar
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-4">
        <form
          onSubmit={alEnviar}
          noValidate
          className="flex w-full max-w-lg flex-col gap-5 rounded-3xl border border-lz-border bg-lz-surface p-5 shadow-lz-card"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={idContado} className="font-lz-display text-base font-semibold text-lz-charcoal">
              Efectivo contado
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-lz-display text-3xl font-bold text-lz-charcoal-muted"
              >
                $
              </span>
              <input
                id={idContado}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={contado}
                disabled={enviando}
                onChange={(e) => cambiarContado(conMiles(e.target.value))}
                aria-invalid={errorContado ? true : undefined}
                aria-describedby={errorContado ? idErrorContado : undefined}
                className={claseCampo(errorContado)}
              />
            </div>
            {errorContado && (
              <p id={idErrorContado} role="alert" className="text-sm font-medium text-lz-danger">
                {errorContado}
              </p>
            )}
          </div>

          <SelectorPersona
            personas={personas}
            value={persona}
            onChange={cambiarPersona}
            error={errorPersona}
            etiqueta="¿Quién cierra el turno?"
            disabled={enviando}
          />

          {errorEnvio === 'SIN_CONEXION' && (
            <AvisoSinConexion
              mensaje="El turno no se cerró. Revise el internet y vuelva a intentar."
              onReintentar={() => void enviar()}
              reintentando={enviando}
            />
          )}
          {errorEnvio === 'OTRO' && (
            <p
              role="alert"
              className="rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3 text-base font-medium text-lz-danger"
            >
              El turno no se cerró. Intente de nuevo.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onCancelar}
              disabled={enviando}
              className="min-h-[56px] min-w-[44px] flex-1 rounded-2xl border-2 border-lz-border bg-lz-surface px-5 text-lg font-semibold text-lz-charcoal transition-colors hover:bg-lz-sage-light disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="min-h-[56px] min-w-[44px] flex-[2] rounded-2xl bg-lz-sage px-6 font-lz-display text-xl font-bold text-lz-surface transition-colors hover:bg-lz-sage-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {enviando ? 'Cerrando turno…' : 'Confirmar cierre'}
            </button>
          </div>
        </form>
      </div>

      {/* Otro dispositivo cerró primero (Req 1.7) */}
      {yaCerrado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-lz-charcoal/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="El turno ya fue cerrado"
            className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-lz-surface p-6 shadow-lz-float"
          >
            <h3 className="font-lz-display text-xl font-bold text-lz-charcoal">El turno ya fue cerrado</h3>
            <p className="text-base text-lz-charcoal">
              El turno ya fue cerrado por {yaCerrado.cerradoPor} a las {hora12(yaCerrado.cerradoEn)}.
            </p>
            <button
              type="button"
              onClick={() => onYaCerrado(yaCerrado)}
              className="min-h-[48px] min-w-[44px] rounded-2xl bg-lz-sage px-5 text-base font-bold text-lz-surface hover:bg-lz-sage-dark"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CierreTurno;
