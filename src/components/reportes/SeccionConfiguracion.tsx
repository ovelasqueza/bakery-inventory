'use client';

// Sección Configuración del Modulo_Reportes: reúne los subpaneles del Modulo_Parametrizacion (Req 11.3, 14).

import { useCallback, useState } from 'react';
import { ConfigMetodosPago } from './ConfigMetodosPago';
import { ConfigCategoriasGasto } from './ConfigCategoriasGasto';
import { ConfigCategoriasProducto } from './ConfigCategoriasProducto';
import { ConfigPersonas } from './ConfigPersonas';
import { ConfigCajon } from './ConfigCajon';
import { ConfigProductosCaja } from './ConfigProductosCaja';
import { ConfigPin } from './ConfigPin';

export function SeccionConfiguracion() {
  const [versionCategorias, setVersionCategorias] = useState(0);
  const alCambiarCategorias = useCallback(() => {
    setVersionCategorias((v) => v + 1);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ConfigMetodosPago />
        <ConfigCategoriasGasto />
        <ConfigCategoriasProducto onCambio={alCambiarCategorias} />
        <ConfigPersonas />
        <div className="lg:col-span-2">
          <ConfigCajon />
        </div>
      </div>
      <ConfigProductosCaja versionCategorias={versionCategorias} />
      <ConfigPin />
    </div>
  );
}

export default SeccionConfiguracion;
