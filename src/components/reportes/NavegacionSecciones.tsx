'use client';

// Pestañas de las secciones del Modulo_Reportes (Req 11.3; Caja mayor: caja-mayor Req 8.1;
// Autoconsumo: barra-acciones-caja Req 12.1).

export type SeccionModulo =
  | 'resumen'
  | 'ventas'
  | 'productos'
  | 'turnos'
  | 'gastos'
  | 'vales'
  | 'metodos'
  | 'autoconsumo'
  | 'caja-mayor'
  | 'configuracion';

export const SECCIONES: { id: SeccionModulo; etiqueta: string }[] = [
  { id: 'resumen', etiqueta: 'Resumen' },
  { id: 'ventas', etiqueta: 'Ventas' },
  { id: 'productos', etiqueta: 'Productos' },
  { id: 'turnos', etiqueta: 'Turnos' },
  { id: 'gastos', etiqueta: 'Gastos' },
  { id: 'vales', etiqueta: 'Vales' },
  { id: 'metodos', etiqueta: 'Métodos de pago' },
  { id: 'autoconsumo', etiqueta: 'Autoconsumo' },
  { id: 'caja-mayor', etiqueta: 'Caja mayor' },
  { id: 'configuracion', etiqueta: 'Configuración' },
];

interface NavegacionSeccionesProps {
  activa: SeccionModulo;
  onCambiar: (seccion: SeccionModulo) => void;
}

export function NavegacionSecciones({ activa, onCambiar }: NavegacionSeccionesProps) {
  return (
    <nav aria-label="Secciones de reportes" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="flex w-max gap-2 pb-1">
        {SECCIONES.map((s) => {
          const seleccionada = s.id === activa;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={seleccionada}
              onClick={() => onCambiar(s.id)}
              className={`min-h-[44px] min-w-[44px] whitespace-nowrap rounded-2xl border-2 px-4 text-sm font-semibold transition-colors ${
                seleccionada
                  ? 'border-lz-sage bg-lz-sage text-lz-surface'
                  : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
              }`}
            >
              {s.etiqueta}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default NavegacionSecciones;
