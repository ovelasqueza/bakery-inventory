'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { imprimirReciboCierre, mensajeImpresion } from '@/lib/recibo/imprimir';

export type EstadoImpresion = 'inactivo' | 'imprimiendo' | 'listo' | 'fallo';

/**
 * Imprime el Recibo_Cierre de un turno (Req 5.1-5.8).
 * - `automatico`: imprime una sola vez al montar, aunque React monte dos veces en modo estricto.
 * - `imprimir` ignora toques mientras ya hay una impresión en curso.
 * - Si el componente se desmonta, el resultado se descarta.
 */
export function useImprimirRecibo(turnoId: string, automatico: boolean) {
  const [estado, setEstado] = useState<EstadoImpresion>('inactivo');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const enProceso = useRef(false);
  const yaImpreso = useRef(false);
  const montado = useRef(false);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const imprimir = useCallback(() => {
    if (enProceso.current) return;
    enProceso.current = true;
    setEstado('imprimiendo');
    setMensaje(null);
    void imprimirReciboCierre(turnoId).then((r) => {
      enProceso.current = false;
      if (!montado.current) return;
      setEstado(r.ok ? 'listo' : 'fallo');
      setMensaje(mensajeImpresion(r));
    });
  }, [turnoId]);

  useEffect(() => {
    if (!automatico || yaImpreso.current) return;
    yaImpreso.current = true;
    imprimir();
  }, [automatico, imprimir]);

  return { estado, mensaje, imprimir };
}
