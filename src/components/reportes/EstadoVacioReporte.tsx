'use client';

// Estado vacío de las secciones de reportes cuando el rango no tiene Ventas ni Gastos (Req 12.10).

export const MENSAJE_SIN_MOVIMIENTOS = 'Sin movimientos en este rango';

export function EstadoVacioReporte() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-2xl border border-lz-border bg-lz-oat px-4 py-12 text-center"
    >
      <h3 className="font-lz-display text-lg font-semibold text-lz-charcoal">{MENSAJE_SIN_MOVIMIENTOS}</h3>
      <p className="mt-1 max-w-sm text-sm text-lz-charcoal-muted">
        Elija otro rango de fechas para ver las cifras.
      </p>
    </div>
  );
}

export default EstadoVacioReporte;
