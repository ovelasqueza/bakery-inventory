'use client';

// Foto del producto en Caja; si no hay URL o no carga, muestra la inicial en mayúscula (Req 4.4, 10.11).

import { useEffect, useState } from 'react';

interface ImagenProductoProps {
  nombre: string;
  imagenUrl: string | null;
  className?: string;
}

export function ImagenProducto({ nombre, imagenUrl, className = '' }: ImagenProductoProps) {
  const [fallo, setFallo] = useState(false);

  // Una URL nueva merece otro intento.
  useEffect(() => {
    setFallo(false);
  }, [imagenUrl]);

  if (!imagenUrl || fallo) {
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
    // eslint-disable-next-line @next/next/no-img-element -- URL pública del bucket, sin optimizador de Next
    <img
      src={imagenUrl}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFallo(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
