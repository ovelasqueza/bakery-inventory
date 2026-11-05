'use client';

// Opciones independientes de apertura del cajón (Req 14.7, 14.10, 14.12).

import { useCallback, useEffect, useId, useState } from 'react';
import { useToast } from '@/components/ui';
import { guardarConfig, obtenerParametrosCaja } from '@/lib/api/parametros';
import { ErrorApp } from '@/lib/api/errores';

type ClaveCajon = 'cajon_al_cobrar' | 'cajon_en_turno';
type Valores = Record<ClaveCajon, boolean>;

const OPCIONES: { clave: ClaveCajon; titulo: string; detalle: string }[] = [
  {
    clave: 'cajon_al_cobrar',
    titulo: 'Abrir el cajón al cobrar en efectivo',
    detalle: 'Se abre cuando se registra una venta pagada en efectivo.',
  },
  {
    clave: 'cajon_en_turno',
    titulo: 'Abrir el cajón al abrir o cerrar turno',
    detalle: 'Se abre al iniciar y al cerrar un turno de caja.',
  },
];

function mensajeServidor(error: unknown): string {
  if (error instanceof ErrorApp && error.codigo === 'SIN_CONEXION') {
    return 'Sin conexión. No se guardó el cambio.';
  }
  return 'No se pudo guardar el cambio. Intente de nuevo.';
}

interface ConfigCajonProps {
  /** Valores guardados, si quien lo usa ya los cargó. Sin ellos se consultan al montar. */
  valoresIniciales?: { cajonAlCobrar: boolean; cajonEnTurno: boolean };
}

export function ConfigCajon({ valoresIniciales }: ConfigCajonProps) {
  const { showToast } = useToast();
  const idTitulo = useId();

  const [valores, setValores] = useState<Valores | null>(
    valoresIniciales
      ? { cajon_al_cobrar: valoresIniciales.cajonAlCobrar, cajon_en_turno: valoresIniciales.cajonEnTurno }
      : null,
  );
  const [errorCarga, setErrorCarga] = useState(false);
  const [guardando, setGuardando] = useState<Record<ClaveCajon, boolean>>({
    cajon_al_cobrar: false,
    cajon_en_turno: false,
  });
  const [errores, setErrores] = useState<Partial<Record<ClaveCajon, string>>>({});

  const cargar = useCallback(async () => {
    setErrorCarga(false);
    setValores(null);
    try {
      const p = await obtenerParametrosCaja();
      setValores({ cajon_al_cobrar: p.cajonAlCobrar, cajon_en_turno: p.cajonEnTurno });
    } catch {
      setErrorCarga(true);
    }
  }, []);

  const tieneIniciales = valoresIniciales !== undefined;
  useEffect(() => {
    if (!tieneIniciales) void cargar();
  }, [tieneIniciales, cargar]);

  async function alternar(clave: ClaveCajon) {
    if (!valores || guardando[clave]) return;
    const anterior = valores[clave];
    const nuevo = !anterior;

    // Cambio optimista; se revierte si el guardado falla (Req 14.12).
    setValores((v) => (v ? { ...v, [clave]: nuevo } : v));
    setGuardando((g) => ({ ...g, [clave]: true }));
    setErrores((e) => ({ ...e, [clave]: undefined }));
    try {
      await guardarConfig(clave, nuevo ? 'true' : 'false');
      showToast('Cambio guardado', 'success');
    } catch (err) {
      setValores((v) => (v ? { ...v, [clave]: anterior } : v));
      setErrores((e) => ({ ...e, [clave]: mensajeServidor(err) }));
    } finally {
      setGuardando((g) => ({ ...g, [clave]: false }));
    }
  }

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-3 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft"
    >
      <div className="flex flex-col gap-1">
        <h3 id={idTitulo} className="font-lz-display text-lg font-bold text-lz-charcoal">
          Cajón de dinero
        </h3>
        <p className="text-sm text-lz-charcoal-muted">Los cambios se usan desde la siguiente carga de la Caja.</p>
      </div>

      {errorCarga ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-3"
        >
          <p className="text-sm font-medium text-lz-danger">No se pudieron cargar las opciones del cajón.</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="min-h-[44px] self-start rounded-2xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark"
          >
            Reintentar
          </button>
        </div>
      ) : !valores ? (
        <p role="status" className="text-sm text-lz-charcoal-muted">
          Cargando…
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {OPCIONES.map((o) => {
            const activo = valores[o.clave];
            const idDetalle = `${idTitulo}-${o.clave}`;
            return (
              <li key={o.clave} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-lz-border px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-base font-medium text-lz-charcoal">{o.titulo}</span>
                    <span id={idDetalle} className="text-sm text-lz-charcoal-muted">
                      {o.detalle}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activo}
                    aria-label={o.titulo}
                    aria-describedby={idDetalle}
                    onClick={() => void alternar(o.clave)}
                    disabled={guardando[o.clave]}
                    className={`relative inline-flex min-h-[44px] min-w-[72px] shrink-0 items-center rounded-full border-2 px-1 transition-colors disabled:opacity-60 ${
                      activo ? 'border-lz-sage bg-lz-sage' : 'border-lz-border bg-lz-oat'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-8 w-8 rounded-full bg-lz-surface shadow-lz-soft transition-transform ${
                        activo ? 'translate-x-7' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                {errores[o.clave] && (
                  <p
                    role="alert"
                    className="rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 text-sm font-medium text-lz-danger"
                  >
                    {errores[o.clave]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default ConfigCajon;
