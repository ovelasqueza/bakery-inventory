'use client';

// Pantalla de apertura de turno: solo Persona_Caja (sin base en cajón).

import { useRef, useState, type FormEvent } from 'react';
import { LogoLizpan } from '@/components/marca/LogoLizpan';
import { useToast } from '@/components/ui';
import { SelectorPersona } from '@/components/caja/SelectorPersona';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';
import { useClaveIdempotente } from '@/hooks/caja/useClaveIdempotente';
import { abrirTurno, type TurnoAbierto } from '@/lib/api/turnos';
import { ErrorApp } from '@/lib/api/errores';
import type { PersonaCajaParam } from '@/lib/api/parametros';
import { validarNombrePersona } from '@/lib/caja/validacion';
import { hora12 } from '@/lib/fechas/bogota';

interface AbrirTurnoProps {
  personas: PersonaCajaParam[];
  onAbierto: (turno: TurnoAbierto, resultado: 'abierto' | 'existente') => void;
  /** Pide al Agente_Cajon abrir el cajón; quien llama decide si está activado y muestra sus avisos. */
  abrirCajon: () => Promise<void>;
}

const MENSAJES_NOMBRE = {
  VACIO: 'Escriba o escoja quién está en la caja.',
  LARGO: 'El nombre puede tener hasta 60 letras.',
} as const;

export function AbrirTurno({ personas, onAbierto, abrirCajon }: AbrirTurnoProps) {
  const { showToast } = useToast();

  const [persona, setPersona] = useState('');
  const [errorPersona, setErrorPersona] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<'SIN_CONEXION' | 'OTRO' | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);

  // Misma clave mientras no cambie la persona: un reintento no abre otro turno (Req 17.8).
  const { clave, renovar } = useClaveIdempotente(persona.trim());

  const enviar = async () => {
    if (enviandoRef.current) return;

    const nombre = validarNombrePersona(persona);
    setErrorPersona(nombre.ok ? null : MENSAJES_NOMBRE[nombre.error]);
    if (!nombre.ok) return;

    enviandoRef.current = true;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const { resultado, turno } = await abrirTurno(clave, nombre.valor);
      renovar();
      if (resultado === 'existente') {
        showToast(
          `Ya hay un turno abierto por ${turno.abiertoPor} desde ${hora12(turno.abiertoEn)}`,
          'warning',
        );
        onAbierto(turno, 'existente');
        return;
      }
      void abrirCajon().catch(() => undefined);
      onAbierto(turno, 'abierto');
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

  const cambiarPersona = (valor: string) => {
    setPersona(valor);
    if (errorPersona) setErrorPersona(null);
    setErrorEnvio(null);
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-lz-linen p-4 sm:p-8">
      <form
        onSubmit={alEnviar}
        noValidate
        className="flex w-full max-w-lg flex-col gap-6 rounded-3xl border border-lz-border bg-lz-surface p-6 shadow-lz-soft sm:p-8"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoLizpan alto={128} />
          <h1 className="font-lz-display text-2xl font-bold text-lz-charcoal">Abrir turno</h1>
          <p className="text-base text-lz-charcoal-muted">Escoja su nombre para empezar.</p>
        </div>

        <SelectorPersona
          personas={personas}
          value={persona}
          onChange={cambiarPersona}
          error={errorPersona}
          disabled={enviando}
        />

        {errorEnvio === 'SIN_CONEXION' && (
          <AvisoSinConexion
            mensaje="El turno no se abrió. Revise el internet y vuelva a intentar."
            onReintentar={() => void enviar()}
            reintentando={enviando}
          />
        )}
        {errorEnvio === 'OTRO' && (
          <p
            role="alert"
            className="rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-3 text-base font-medium text-lz-danger"
          >
            El turno no se abrió. Intente de nuevo.
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="min-h-[56px] w-full rounded-2xl bg-lz-sage px-6 font-lz-display text-xl font-bold text-lz-surface transition-colors hover:bg-lz-sage-dark active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {enviando ? 'Abriendo turno…' : 'Abrir turno'}
        </button>
      </form>
    </div>
  );
}

export default AbrirTurno;
