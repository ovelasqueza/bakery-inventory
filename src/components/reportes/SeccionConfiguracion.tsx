'use client';

// Sección Configuración del Modulo_Reportes: reúne los subpaneles del Modulo_Parametrizacion (Req 11.3, 14).

import { ConfigMetodosPago } from './ConfigMetodosPago';
import { ConfigCategoriasGasto } from './ConfigCategoriasGasto';
import { ConfigPersonas } from './ConfigPersonas';
import { ConfigBaseCaja } from './ConfigBaseCaja';
import { ConfigCajon } from './ConfigCajon';
import { ConfigProductosCaja } from './ConfigProductosCaja';
import { ConfigPin } from './ConfigPin';

export function SeccionConfiguracion() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ConfigMetodosPago />
        <ConfigCategoriasGasto />
        <ConfigPersonas />
        <div className="flex flex-col gap-4">
          <ConfigBaseCaja />
          <ConfigCajon />
        </div>
      </div>
      <ConfigProductosCaja />
      <ConfigPin />
    </div>
  );
}

export default SeccionConfiguracion;
