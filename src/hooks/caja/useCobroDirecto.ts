'use client';

import { useCallback, useRef, useState } from 'react';
import { ErrorApp } from '@/lib/api/errores';
import { registrarVentaValor, type VentaRegistrada } from '@/lib/api/ventas';
import { datosCobroDirecto, firmaCobroDirecto } from '@/lib/caja/cobro';
import { useClavePorFirma } from './useClaveIdempotente';

export type ErrorCobroDirecto = null | { tipo: 'sin_conexion' } | { tipo: 'mensaje'; texto: string };

export const TEXTO_EFECTIVO_MAXIMO =
  'En efectivo se cobra hasta $ 10.000.000. Escoja otro método o divida la venta.';
export const TEXTO_METODO_INVALIDO = 'Ese método de pago ya no está disponible. Escoja otro.';
export const TEXTO_VENTA_NO_GUARDADA = 'La venta no se guardó. Intente de nuevo.';

export interface OpcionesCobroDirecto {
  turnoId: string;
  onRegistrada: (venta: VentaRegistrada) => void;
  onTurnoCerrado: () => void;
  abrirCajon: () => Promise<unknown>;
}

export interface CobroDirectoHook {
  registrando: boolean;
  error: ErrorCobroDirecto;
  limpiarError: () => void;
  cobrar: (valores: number[], metodo: { id: string; esEfectivo: boolean }) => Promise<void>;
}

/**
 * Registro directo de la Venta_Por_Valor desde la Calculadora (Req 6).
 * La Lista_Valores vive en quien llama: ante cualquier error no se toca.
 */
export function useCobroDirecto(opciones: OpcionesCobroDirecto): CobroDirectoHook {
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<ErrorCobroDirecto>(null);
  const enProceso = useRef(false);
  const { claveDe, renovar } = useClavePorFirma();

  // Siempre las opciones del último render, sin rehacer `cobrar`.
  const ops = useRef(opciones);
  ops.current = opciones;

  const limpiarError = useCallback(() => setError(null), []);

  const cobrar = useCallback(
    async (valores: number[], metodo: { id: string; esEfectivo: boolean }) => {
      if (enProceso.current) return;

      const datos = datosCobroDirecto(valores, metodo.esEfectivo);
      if (!datos.ok) {
        if (datos.motivo === 'EFECTIVO_MAXIMO') {
          setError({ tipo: 'mensaje', texto: TEXTO_EFECTIVO_MAXIMO });
        }
        return;
      }

      enProceso.current = true;
      setRegistrando(true);
      setError(null);
      const clave = claveDe(firmaCobroDirecto(valores, metodo.id));
      try {
        const venta = await registrarVentaValor({
          clave,
          turnoId: ops.current.turnoId,
          metodoPagoId: metodo.id,
          valores,
          recibido: datos.recibido,
        });
        if (venta.esEfectivo) {
          // El cajón no bloquea: la venta ya quedó registrada.
          void ops.current.abrirCajon().catch(() => undefined);
        }
        renovar();
        ops.current.onRegistrada(venta);
      } catch (e) {
        const codigo = e instanceof ErrorApp ? e.codigo : 'DESCONOCIDO';
        switch (codigo) {
          case 'SIN_CONEXION':
            // La clave se conserva: el reintento con la misma lista y método la reutiliza.
            setError({ tipo: 'sin_conexion' });
            break;
          case 'TURNO_CERRADO':
            ops.current.onTurnoCerrado();
            break;
          case 'METODO_INVALIDO':
            setError({ tipo: 'mensaje', texto: TEXTO_METODO_INVALIDO });
            break;
          case 'RECIBIDO_INVALIDO':
            setError({ tipo: 'mensaje', texto: TEXTO_EFECTIVO_MAXIMO });
            break;
          default:
            setError({ tipo: 'mensaje', texto: TEXTO_VENTA_NO_GUARDADA });
        }
      } finally {
        enProceso.current = false;
        setRegistrando(false);
      }
    },
    [claveDe, renovar]
  );

  return { registrando, error, limpiarError, cobrar };
}
