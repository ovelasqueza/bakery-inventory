'use client';

// Encabezado de la Caja: logo y reloj a la izquierda y, con turno, el Grupo_Acciones a la derecha
// (Req 1.1, 1.2, 2.1–2.5). El botón para abrir el cajón es flotante (BotonAbrirCajon variante="flotante").

import { useEffect, useState, type ReactNode } from 'react';
import { LogoLizpan } from '@/components/marca/LogoLizpan';
import { hora12 } from '@/lib/fechas/bogota';
import { ENCABEZADO, MEDIDAS, type LayoutCaja } from '@/lib/caja/layout';

const INTERVALO_RELOJ_MS = 1000;
const FORMATO_DIA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Reloj en hora de Bogotá; se pinta solo en el cliente para evitar diferencias de hidratación.
 * Con `soloHora` no muestra el día.
 */
function Reloj({ soloHora = false }: { soloHora?: boolean }) {
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    setAhora(new Date());
    const id = window.setInterval(() => setAhora(new Date()), INTERVALO_RELOJ_MS);
    return () => window.clearInterval(id);
  }, []);

  // Formato de 12 horas: 3:48 pm
  let hora = '--:--';
  let sufijo = '';
  if (ahora) {
    [hora, sufijo] = hora12(ahora).split(' ');
  }

  // Día en Bogotá: "Miércoles, 12 de marzo"
  const dia = ahora ? FORMATO_DIA.format(ahora).replace(/^./, (c) => c.toLocaleUpperCase('es-CO')) : '';

  return (
    <span className="flex flex-col justify-center gap-0.5 text-lz-charcoal" aria-label={soloHora ? `Hora actual ${hora} ${sufijo}` : `Hora actual ${hora} ${sufijo}. ${dia}`}>
      <span className="flex items-baseline gap-1">
        <span className="font-lz-display text-2xl font-bold leading-none tracking-tight tabular-nums">{hora}</span>
        <span className="font-lz-display text-sm font-bold leading-none text-lz-charcoal-muted">{sufijo}</span>
      </span>
      {/* En pantallas angostas solo cabe la hora; el día aparece desde sm. */}
      {!soloHora && (
        <span className="hidden whitespace-nowrap text-xs font-semibold leading-none text-lz-charcoal-muted sm:block">{dia}</span>
      )}
    </span>
  );
}

interface EncabezadoCajaProps {
  /** Ausente mientras carga o con error: se muestra solo logo + reloj. */
  layout?: LayoutCaja;
  /** Grupo_Acciones (solo con turno abierto); va a la derecha. */
  acciones?: ReactNode;
}

export function EncabezadoCaja({ layout, acciones }: EncabezadoCajaProps = {}) {
  const conAcciones = acciones != null && acciones !== false;
  // Sin acciones siempre logo + reloj (Req 2.1); con acciones según el ancho (Req 2.2–2.4).
  const parte = conAcciones ? layout?.encabezado ?? 'completo' : 'completo';
  const margen = layout?.modo === 'movil' ? ENCABEZADO.margen.movil : ENCABEZADO.margen.escritorio;

  return (
    <header
      className="flex shrink-0 items-center justify-between overflow-hidden border-b border-lz-border bg-lz-linen"
      style={{
        height: MEDIDAS.encabezado,
        paddingLeft: margen,
        paddingRight: margen,
        columnGap: conAcciones && parte !== 'acciones' ? ENCABEZADO.gapIzquierda : 0,
      }}
    >
      {parte === 'completo' && (
        // El logo cede espacio para que el Grupo_Acciones siempre quepa.
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
          <LogoLizpan alto={80} className="min-w-0 max-w-full shrink object-contain object-left" />
          <div className="shrink-0 border-l border-lz-border pl-2 sm:pl-3">
            <Reloj />
          </div>
        </div>
      )}
      {parte === 'reloj' && (
        <div className="flex min-w-0 flex-1 items-center overflow-hidden">
          <Reloj soloHora />
        </div>
      )}

      {conAcciones && <div className="ml-auto flex shrink-0 items-center">{acciones}</div>}
    </header>
  );
}

export default EncabezadoCaja;