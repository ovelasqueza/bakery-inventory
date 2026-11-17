'use client';

// Pestañas de las secciones del Modulo_Reportes (Req 11.3; Caja mayor: caja-mayor Req 8.1;
// Autoconsumo: barra-acciones-caja Req 12.1).

export type SeccionModulo =
  | 'resumen'
  | 'balance-diario'
  | 'horas-pico'
  | 'productos'
  | 'ventas'
  | 'turnos'
  | 'gastos'
  | 'vales'
  | 'metodos'
  | 'autoconsumo'
  | 'caja-mayor'
  | 'configuracion';

export const SECCIONES: { id: SeccionModulo; etiqueta: string; etiquetaCorta?: string }[] = [
  { id: 'resumen', etiqueta: 'Resumen' },
  { id: 'balance-diario', etiqueta: 'Ventas y gastos por día', etiquetaCorta: 'Ventas / Gastos' },
  { id: 'horas-pico', etiqueta: 'Horas pico', etiquetaCorta: 'Horas pico' },
  { id: 'productos', etiqueta: 'Productos' },
  { id: 'ventas', etiqueta: 'Ventas' },
  { id: 'turnos', etiqueta: 'Turnos' },
  { id: 'gastos', etiqueta: 'Gastos' },
  { id: 'vales', etiqueta: 'Vales' },
  { id: 'metodos', etiqueta: 'Métodos de pago', etiquetaCorta: 'Métodos' },
  { id: 'autoconsumo', etiqueta: 'Autoconsumo' },
  { id: 'caja-mayor', etiqueta: 'Caja mayor' },
  { id: 'configuracion', etiqueta: 'Configuración', etiquetaCorta: 'Ajustes' },
];

interface NavegacionSeccionesProps {
  activa: SeccionModulo;
  onCambiar: (seccion: SeccionModulo) => void;
}

export function NavegacionSecciones({ activa, onCambiar }: NavegacionSeccionesProps) {
  return (
    <nav aria-label="Secciones de reportes">
      <div
        role="tablist"
        className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2"
      >
        {SECCIONES.map((s) => {
          const seleccionada = s.id === activa;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={seleccionada}
              onClick={() => onCambiar(s.id)}
              className={`min-h-[40px] rounded-xl border-2 px-2 py-1.5 text-center text-xs font-semibold leading-tight transition-colors sm:min-h-[44px] sm:rounded-2xl sm:px-4 sm:text-sm ${
                seleccionada
                  ? 'border-lz-sage bg-lz-sage text-lz-surface shadow-lz-soft'
                  : 'border-lz-border bg-lz-surface text-lz-charcoal hover:border-lz-sage-medium hover:bg-lz-sage-light'
              }`}
            >
              <span className="sm:hidden">{s.etiquetaCorta ?? s.etiqueta}</span>
              <span className="hidden sm:inline">{s.etiqueta}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default NavegacionSecciones;
