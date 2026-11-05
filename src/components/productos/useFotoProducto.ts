'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useToast } from '@/components/ui';
import { procesarFoto, TIPOS, type ErrorFoto } from '@/lib/imagen/procesarFoto';
import { subirFotoProducto, quitarFotoProducto } from '@/lib/api/fotos';
import { ErrorApp } from '@/lib/api/errores';

export type EstadoFoto = 'listo' | 'procesando' | 'subiendo' | 'quitando';

export const ACEPTA_FOTOS = TIPOS.join(',');

const MENSAJES_FOTO: Record<ErrorFoto, string> = {
  FORMATO: 'Formato no admitido. Usa JPG, PNG o WebP',
  DANADO: 'No se pudo leer la imagen',
  GRANDE: 'La imagen pesa más de 25 MB',
  SIN_WEBP: 'Este navegador no puede convertir a WebP. Usa Chrome, Edge o Firefox',
  PESADA: 'La imagen es demasiado pesada',
};

function mensajeErrorServidor(error: unknown, accion: 'subir' | 'quitar'): string {
  if (error instanceof ErrorApp && error.codigo === 'SIN_CONEXION') {
    return 'Sin conexión. La foto no cambió, inténtalo de nuevo';
  }
  return accion === 'subir'
    ? 'No se pudo subir la foto. La foto anterior se conserva'
    : 'No se pudo quitar la foto. Inténtalo de nuevo';
}

/**
 * Subida de la foto de un producto en un solo paso: escoger archivo → convertir a WebP 4:3
 * sin recorte (`procesarFoto`) → subir (`subirFotoProducto`). Sin paso de confirmación.
 */
export function useFotoProducto(
  productoId: string,
  imagenPath: string | null,
  onCambio?: (nuevoPath: string | null) => void,
) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pathActual, setPathActual] = useState<string | null>(imagenPath);
  const [estado, setEstado] = useState<EstadoFoto>('listo');
  // Evita dos subidas a la vez aunque el estado de React aún no se haya actualizado.
  const ocupadoRef = useRef(false);

  useEffect(() => {
    setPathActual(imagenPath);
  }, [imagenPath]);

  const ocupado = estado !== 'listo';

  const abrirSelector = useCallback(() => {
    if (ocupadoRef.current) return;
    inputRef.current?.click();
  }, []);

  async function alEscogerArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    // Permite volver a escoger el mismo archivo.
    e.target.value = '';
    if (!archivo || ocupadoRef.current) return;

    ocupadoRef.current = true;
    setEstado('procesando');
    try {
      let resultado;
      try {
        resultado = await procesarFoto(archivo);
      } catch {
        showToast(MENSAJES_FOTO.DANADO, 'error');
        return;
      }
      if (!resultado.ok) {
        showToast(MENSAJES_FOTO[resultado.error], 'error');
        return;
      }

      setEstado('subiendo');
      try {
        const nuevoPath = await subirFotoProducto(productoId, resultado.archivo, pathActual);
        setPathActual(nuevoPath);
        onCambio?.(nuevoPath);
        showToast('Foto guardada', 'success');
      } catch (error) {
        showToast(mensajeErrorServidor(error, 'subir'), 'error');
      }
    } finally {
      ocupadoRef.current = false;
      setEstado('listo');
    }
  }

  async function quitar(): Promise<boolean> {
    if (ocupadoRef.current) return false;
    ocupadoRef.current = true;
    setEstado('quitando');
    try {
      await quitarFotoProducto(productoId, pathActual);
      setPathActual(null);
      onCambio?.(null);
      showToast('Foto quitada', 'success');
      return true;
    } catch (error) {
      showToast(mensajeErrorServidor(error, 'quitar'), 'error');
      return false;
    } finally {
      ocupadoRef.current = false;
      setEstado('listo');
    }
  }

  return { inputRef, pathActual, estado, ocupado, abrirSelector, alEscogerArchivo, quitar };
}
