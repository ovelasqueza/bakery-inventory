'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApp, traducirError } from '@/lib/api/errores';
import { obtenerParametrosCaja, type ParametrosCaja } from '@/lib/api/parametros';
import { obtenerTurnoAbierto, type TurnoAbierto } from '@/lib/api/turnos';

export type EstadoCarga = 'cargando' | 'error' | 'listo';

export interface TurnoCaja {
  estado: EstadoCarga;
  /** Turno abierto, o `null` si no hay ninguno (Caja muestra la apertura, Req 2.1). */
  turno: TurnoAbierto | null;
  /** Parámetros leídos en esta carga de la pantalla (Req 14.10). */
  parametros: ParametrosCaja | null;
  error: ErrorApp | null;
  /** Carga completa con indicador: turno y parámetros. */
  recargar: () => Promise<void>;
  /** Reemplaza el turno local tras abrir, cerrar o registrar movimientos (Req 7.4). */
  setTurno: (turno: TurnoAbierto | null) => void;
}

/**
 * Lee el Turno_Abierto y los parámetros de Caja al montar.
 * Al volver a la pestaña (`visibilitychange` visible) o al recibir `focus`, vuelve a leer
 * solo el turno, sin indicador de carga, para notar un turno cerrado en otro dispositivo.
 */
export function useTurnoCaja(): TurnoCaja {
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [turno, setTurnoEstado] = useState<TurnoAbierto | null>(null);
  const [parametros, setParametros] = useState<ParametrosCaja | null>(null);
  const [error, setError] = useState<ErrorApp | null>(null);

  const montado = useRef(true);
  // Cada lectura toma un número; solo la más reciente puede escribir el estado.
  const ultimaLectura = useRef(0);
  const estadoRef = useRef<EstadoCarga>('cargando');
  estadoRef.current = estado;

  const recargar = useCallback(async () => {
    const id = ++ultimaLectura.current;
    setEstado('cargando');
    setError(null);
    try {
      const [t, p] = await Promise.all([obtenerTurnoAbierto(), obtenerParametrosCaja()]);
      if (!montado.current || id !== ultimaLectura.current) return;
      setTurnoEstado(t);
      setParametros(p);
      setEstado('listo');
    } catch (e) {
      if (!montado.current || id !== ultimaLectura.current) return;
      setError(traducirError(e));
      setEstado('error');
    }
  }, []);

  const refrescarTurno = useCallback(async () => {
    // Si la carga inicial no terminó o falló, el refresco silencioso no aplica.
    if (estadoRef.current !== 'listo') return;
    const id = ++ultimaLectura.current;
    try {
      const t = await obtenerTurnoAbierto();
      if (!montado.current || id !== ultimaLectura.current) return;
      setTurnoEstado(t);
    } catch {
      // Sin conexión u otro fallo: se conserva el turno mostrado hasta la próxima lectura.
    }
  }, []);

  const setTurno = useCallback((t: TurnoAbierto | null) => {
    // Invalida lecturas en curso para que no pisen el turno recién fijado.
    ultimaLectura.current++;
    setTurnoEstado(t);
  }, []);

  useEffect(() => {
    montado.current = true;
    void recargar();

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') void refrescarTurno();
    };
    const alEnfocar = () => {
      void refrescarTurno();
    };

    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('focus', alEnfocar);
    return () => {
      montado.current = false;
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('focus', alEnfocar);
    };
  }, [recargar, refrescarTurno]);

  return { estado, turno, parametros, error, recargar, setTurno };
}
