'use client';

// Escoger la Persona_Caja. Si hay personas activas configuradas, solo se escoge de la lista;
// el campo de nombre libre aparece únicamente cuando la lista está vacía (Req 2.2, 2.7).

import { useId } from 'react';
import type { PersonaCajaParam } from '@/lib/api/parametros';

export const MAX_NOMBRE_PERSONA = 60;

interface SelectorPersonaProps {
  personas: PersonaCajaParam[];
  /** Nombre escrito o escogido (sin recortar; quien valida lo recorta). */
  value: string;
  onChange: (nombre: string) => void;
  /** Mensaje de error que se muestra junto al campo. */
  error?: string | null;
  etiqueta?: string;
  disabled?: boolean;
}

export function SelectorPersona({
  personas,
  value,
  onChange,
  error,
  etiqueta = '¿Quién está en la caja?',
  disabled = false,
}: SelectorPersonaProps) {
  const idCampo = useId();
  const idError = useId();
  const activas = personas.filter((p) => p.activo);
  const elegido = value.trim();

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-1 font-lz-display text-base font-semibold text-lz-charcoal">{etiqueta}</legend>

      {activas.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Personas de caja"
            aria-describedby={error ? idError : undefined}
          >
            {activas.map((p) => {
              const activo = elegido === p.nombre.trim();
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onChange(p.nombre)}
                  className={`min-h-[48px] min-w-[44px] rounded-2xl border-2 px-5 text-base font-semibold transition-colors disabled:opacity-50 ${
                    activo
                      ? 'border-lz-sage bg-lz-sage text-lz-surface'
                      : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
                  }`}
                >
                  {p.nombre}
                </button>
              );
            })}
          </div>
          {error && (
            <p id={idError} role="alert" className="text-sm font-medium text-lz-danger">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={idCampo} className="text-sm font-medium text-lz-charcoal-muted">
            Nombre
          </label>
          <input
            id={idCampo}
            type="text"
            value={value}
            maxLength={MAX_NOMBRE_PERSONA}
            autoComplete="off"
            placeholder="Escriba un nombre"
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            className={`min-h-[48px] w-full rounded-2xl border-2 bg-lz-surface px-4 text-base text-lz-charcoal placeholder:text-lz-charcoal-muted focus:outline-none ${
              error ? 'border-lz-danger' : 'border-lz-border focus:border-lz-sage'
            }`}
          />
          {error && (
            <p id={idError} role="alert" className="text-sm font-medium text-lz-danger">
              {error}
            </p>
          )}
          <p className="text-xs text-lz-charcoal-muted">
            Para escoger de una lista, agregue las personas en Administración → Reportes → Configuración.
          </p>
        </div>
      )}
    </fieldset>
  );
}

export default SelectorPersona;
