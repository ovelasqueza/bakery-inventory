'use client'

import { useState } from 'react'

const ALTO_MIN = 32
const ALTO_MAX = 128
const TEXTO_MARCA = 'Panadería LIZPAN'

interface LogoLizpanProps {
  /** Altura en px; se acota a 32..128 (Req 16.4). */
  alto?: number
  className?: string
}

function acotarAlto(alto: number): number {
  if (!Number.isFinite(alto)) return 40
  return Math.min(ALTO_MAX, Math.max(ALTO_MIN, alto))
}

export function LogoLizpan({ alto = 40, className = '' }: LogoLizpanProps) {
  const [fallo, setFallo] = useState(false)
  const height = acotarAlto(alto)

  if (fallo) {
    // Req 16.7: si el logo no carga, se muestra el texto de la marca.
    return (
      <span
        className={`inline-flex items-center font-lz-display font-bold text-lz-sage whitespace-nowrap ${className}`}
        style={{ height, fontSize: Math.round(height * 0.45) }}
      >
        {TEXTO_MARCA}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-lizpan-original.png"
      alt={TEXTO_MARCA}
      className={className}
      style={{ height, width: 'auto' }}
      onError={() => setFallo(true)}
    />
  )
}

export default LogoLizpan
