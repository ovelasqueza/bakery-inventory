'use client';

// Personas de caja: crear, renombrar, activar y desactivar; nombre de 1 a 60 caracteres (Req 14.4, 14.8–14.10, 14.12).

import { actualizarPersonaCaja, crearPersonaCaja, listarPersonasCaja } from '@/lib/api/parametros';
import { ListaEditableSimple } from '@/components/reportes/ListaEditableSimple';

const crear = (nombre: string) => crearPersonaCaja(nombre);

export function ConfigPersonas() {
  return (
    <ListaEditableSimple
      titulo="Personas de caja"
      etiquetaNueva="Nueva persona"
      placeholder="Ej: Liz"
      maxNombre={60}
      textoVacio="Todavía no hay personas de caja."
      cargar={listarPersonasCaja}
      crear={crear}
      actualizar={actualizarPersonaCaja}
    />
  );
}

export default ConfigPersonas;
