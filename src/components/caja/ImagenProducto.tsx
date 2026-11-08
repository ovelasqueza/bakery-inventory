'use client';

// Foto del producto en Caja; usa caché local en RAM + CacheStorage para no volver a pedirla a Supabase (Req 4.4, 10.11).

import { useEffect, useState } from 'react';
import { obtenerImagenCacheada, obtenerUrlEnMemoria } from '@/lib/caja/cacheImagenes';

interface ImagenProductoProps {
  nombre: string;
  imagenUrl: string | null;
  className?: string;
}

export function ImagenProducto({ nombre, imagenUrl, className = '' }: ImagenProductoProps) {
  const [fallo, setFallo] = useState(false);
  const [srcResuelta, setSrcResuelta] = useState<string | null>(() =>
    obtenerUrlEnMemoria(imagenUrl) ?? imagenUrl
  );

  useEffect(() => {
    setFallo(false);
    if (!imagenUrl) {
      setSrcResuelta(null);
      return;
    }
    const enRam = obtenerUrlEnMemoria(imagenUrl);
    if (enRam) {
      setSrcResuelta(enRam);
      return;
    }
    setSrcResuelta(imagenUrl);
    let cancelado = false;
    void obtenerImagenCacheada(imagenUrl).then((urlLocal) => {
      if (!cancelado) setSrcResuelta(urlLocal);
    });
    return () => {
      cancelado = true;
    };
  }, [imagenUrl]);

  if (!imagenUrl || !srcResuelta || fallo) {
    const inicial = nombre.trim().charAt(0).toLocaleUpperCase('es-CO') || '?';
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-lz-sage-light to-lz-amber-light ${className}`}
        aria-hidden="true"
      >
        <span className="font-lz-display text-4xl font-bold text-lz-sage">{inicial}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL en caché local (blob:) o pública del bucket
    <img
      src={srcResuelta}
      alt=""
      loading="eager"
      decoding="sync"
      draggable={false}
      onError={() => setFallo(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
