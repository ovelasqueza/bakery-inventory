'use client';

// Estados vacíos y de error del catálogo de Caja (Req 4.8, 4.9, 4.10).

export type VarianteEstadoVacio = 'sin-coincidencias' | 'sin-productos' | 'error';

interface EstadoVacioCajaProps {
  variante: VarianteEstadoVacio;
  /** 'sin-coincidencias': limpia el texto y vuelve a "Todas". */
  onLimpiar?: () => void;
  /** 'error': vuelve a leer el catálogo. */
  onReintentar?: () => void;
  /** 'error': mensaje a mostrar en lugar del predeterminado. */
  mensaje?: string;
}

const TEXTOS: Record<VarianteEstadoVacio, { titulo: string; detalle: string }> = {
  'sin-coincidencias': {
    titulo: 'No hay productos que coincidan',
    detalle: 'Pruebe con otro nombre o con otra categoría.',
  },
  'sin-productos': {
    titulo: 'No hay productos para vender',
    detalle: 'Ponga el precio de venta a los productos en Productos y márquelos como visibles en Caja desde Reportes → Configuración.',
  },
  error: {
    titulo: 'No se pudieron cargar los productos',
    detalle: 'Revise la conexión e intente de nuevo.',
  },
};

const BOTON =
  'mt-2 h-11 min-w-[44px] rounded-xl px-5 text-sm font-semibold transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-lz-sage focus-visible:ring-offset-2';

export function EstadoVacioCaja({ variante, onLimpiar, onReintentar, mensaje }: EstadoVacioCajaProps) {
  const { titulo, detalle } = TEXTOS[variante];
  const esError = variante === 'error';

  return (
    <div className="flex h-full items-center justify-center p-6" role={esError ? 'alert' : 'status'}>
      <div
        className={`flex max-w-sm flex-col items-center gap-2 rounded-2xl border p-6 text-center shadow-lz-soft ${
          esError ? 'border-lz-danger-border bg-lz-danger-surface' : 'border-lz-border bg-lz-surface'
        }`}
      >
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full ${
            esError ? 'bg-lz-surface text-lz-danger' : 'bg-lz-sage-light text-lz-sage'
          }`}
          aria-hidden="true"
        >
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {esError ? (
              <path d="M12 8v5m0 3h.01M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            ) : variante === 'sin-coincidencias' ? (
              <>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </>
            ) : (
              <path d="M3 9h18l-1.5 10a2 2 0 0 1-2 1.7H6.5a2 2 0 0 1-2-1.7L3 9Zm5 0V7a4 4 0 0 1 8 0v2" />
            )}
          </svg>
        </span>
        <p className={`font-lz-display text-lg font-semibold ${esError ? 'text-lz-danger' : 'text-lz-charcoal'}`}>
          {titulo}
        </p>
        <p className="text-sm text-lz-charcoal-muted">{esError && mensaje ? mensaje : detalle}</p>

        {variante === 'sin-coincidencias' && onLimpiar && (
          <button type="button" onClick={onLimpiar} className={`${BOTON} bg-lz-sage text-lz-surface hover:bg-lz-sage-medium`}>
            Limpiar búsqueda
          </button>
        )}
        {esError && onReintentar && (
          <button type="button" onClick={onReintentar} className={`${BOTON} bg-lz-sage text-lz-surface hover:bg-lz-sage-medium`}>
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
