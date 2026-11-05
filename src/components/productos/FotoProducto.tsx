'use client';

import { useEffect, useState } from 'react';
import { Button, Modal, LoadingSpinner } from '@/components/ui';
import { urlFoto } from '@/lib/api/fotos';
import { ACEPTA_FOTOS, useFotoProducto, type EstadoFoto } from './useFotoProducto';

const TEXTO_PROGRESO: Record<EstadoFoto, string | null> = {
  listo: null,
  procesando: 'Preparando foto...',
  subiendo: 'Subiendo foto...',
  quitando: 'Quitando foto...',
};

interface ZonaFotoProps {
  productoId: string;
  nombre: string;
  imagenPath: string | null;
  onCambio?: (nuevoPath: string | null) => void;
  className?: string;
}

/**
 * Espacio de la foto en formato 4:3 (igual que en la Caja). Un toque abre el selector de
 * archivos y la foto se convierte y sube de una vez.
 */
export function ZonaFoto({ productoId, nombre, imagenPath, onCambio, className = '' }: ZonaFotoProps) {
  const { inputRef, pathActual, estado, ocupado, abrirSelector, alEscogerArchivo } =
    useFotoProducto(productoId, imagenPath, onCambio);
  const [errorCarga, setErrorCarga] = useState(false);

  useEffect(() => {
    setErrorCarga(false);
  }, [pathActual]);

  const src = errorCarga ? null : urlFoto(pathActual);
  const progreso = TEXTO_PROGRESO[estado];

  return (
    <>
      <button
        type="button"
        onClick={abrirSelector}
        disabled={ocupado}
        aria-label={pathActual ? `Cambiar foto de ${nombre}` : `Agregar foto a ${nombre}`}
        title={pathActual ? 'Cambiar foto' : 'Agregar foto'}
        className={`group relative block aspect-[4/3] w-full overflow-hidden bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-bakery-500 focus-visible:ring-inset disabled:cursor-wait ${className}`}
      >
        {src ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL pública del bucket */}
            <img
              src={src}
              alt={`Foto de ${nombre}`}
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setErrorCarga(true)}
              className="h-full w-full object-cover"
            />
            {!ocupado && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
                <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow">
                  <IconoCamara className="h-4 w-4" />
                  Cambiar foto
                </span>
              </span>
            )}
          </>
        ) : (
          <span className="flex h-full w-full items-center justify-center border-2 border-dashed border-gray-200 text-gray-300 transition-colors group-hover:border-bakery-300 group-hover:bg-bakery-50 group-hover:text-bakery-500">
            <IconoImagen className="h-10 w-10" />
          </span>
        )}

        {progreso && (
          <span
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-xs font-medium text-gray-700"
            role="status"
            aria-live="polite"
          >
            <LoadingSpinner size="md" />
            {progreso}
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACEPTA_FOTOS}
        className="hidden"
        onChange={alEscogerArchivo}
        disabled={ocupado}
      />
    </>
  );
}

interface FotoProductoProps {
  productoId: string;
  imagenPath: string | null;
  onCambio?: (nuevoPath: string | null) => void;
}

/**
 * Foto del producto en el formulario de edición (Req 10.1–10.10): toque para subir o cambiar
 * y botón para quitarla con confirmación.
 */
export function FotoProducto({ productoId, imagenPath, onCambio }: FotoProductoProps) {
  const { inputRef, pathActual, estado, ocupado, abrirSelector, alEscogerArchivo, quitar } =
    useFotoProducto(productoId, imagenPath, onCambio);
  const [errorCarga, setErrorCarga] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  useEffect(() => {
    setErrorCarga(false);
  }, [pathActual]);

  const src = errorCarga ? null : urlFoto(pathActual);
  const progreso = TEXTO_PROGRESO[estado];

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Foto del producto</p>

      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={abrirSelector}
          disabled={ocupado}
          aria-label={pathActual ? 'Cambiar foto' : 'Agregar foto'}
          className="group relative aspect-[4/3] w-36 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-bakery-500 disabled:cursor-wait"
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL pública del bucket
            <img
              src={src}
              alt="Foto actual del producto"
              className="h-full w-full object-cover"
              onError={() => setErrorCarga(true)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-gray-300 group-hover:bg-bakery-50 group-hover:text-bakery-500">
              <IconoImagen className="h-8 w-8" />
            </span>
          )}
          {ocupado && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <LoadingSpinner size="md" />
            </span>
          )}
        </button>

        <div className="flex-1 space-y-2">
          {progreso ? (
            <p className="text-sm text-gray-600" role="status" aria-live="polite">
              {progreso}
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              Toca la imagen para {pathActual ? 'cambiarla' : 'agregar una'}. Se guarda de inmediato.
            </p>
          )}
          {pathActual && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              onClick={() => setConfirmarQuitar(true)}
              disabled={ocupado}
            >
              Quitar foto
            </Button>
          )}
          <p className="text-xs text-gray-400">JPG, PNG o WebP, hasta 25 MB</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACEPTA_FOTOS}
        className="hidden"
        onChange={alEscogerArchivo}
        disabled={ocupado}
      />

      <Modal
        isOpen={confirmarQuitar}
        onClose={() => {
          if (!ocupado) setConfirmarQuitar(false);
        }}
        title="Quitar foto"
        size="sm"
      >
        <p className="text-gray-700">
          ¿Quitar la foto de este producto? En la Caja se mostrará la inicial del nombre.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirmarQuitar(false)}
            disabled={ocupado}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              if (await quitar()) setConfirmarQuitar(false);
            }}
            disabled={ocupado}
          >
            Quitar foto
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function IconoCamara({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconoImagen({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
