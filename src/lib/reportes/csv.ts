/**
 * Serialización y parseo de CSV (RFC 4180) para la exportación de reportes.
 *
 * - Separador `,`, fin de línea `\r\n`, sin BOM en `serializarCsv`.
 * - Un campo va entre comillas si contiene `,`, `"`, `\r` o `\n`, o si empieza
 *   o termina con espacio; las comillas internas se duplican.
 * - `null` se escribe como campo vacío.
 * - No se antepone `'` a valores que empiezan con `=`, `+`, `-` o `@` para
 *   conservar la ida y vuelta (Req 13.5) y los montos negativos.
 *
 * Requisitos: 13.3, 13.4, 13.5
 */

/** Valor de una celda de tabla. `tablas.ts` lo re-exporta. */
export type Celda = string | number | null;

const SEPARADOR = ',';
const FIN_LINEA = '\r\n';
const BOM = '\uFEFF';

function necesitaComillas(texto: string): boolean {
  return (
    /[",\r\n]/.test(texto) ||
    (texto.length > 0 && (texto[0] === ' ' || texto[texto.length - 1] === ' '))
  );
}

function serializarCampo(celda: Celda): string {
  if (celda === null) return '';
  const texto = typeof celda === 'number' ? String(celda) : celda;
  return necesitaComillas(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function serializarFila(fila: Celda[]): string {
  // Una fila de un solo campo vacío se escribe como `""` para que no se
  // confunda con una línea vacía al parsear.
  if (fila.length === 1 && serializarCampo(fila[0]) === '') return '""';
  return fila.map(serializarCampo).join(SEPARADOR);
}

/** Serializa encabezados y filas a texto CSV (sin BOM). */
export function serializarCsv(columnas: string[], filas: Celda[][]): string {
  return [columnas, ...filas].map(serializarFila).join(FIN_LINEA);
}

/**
 * Parsea texto CSV según RFC 4180. Ignora un BOM inicial. Acepta `\r\n`,
 * `\n` o `\r` como fin de registro y no crea un registro por un fin de línea final.
 */
export function parsearCsv(texto: string): string[][] {
  const t = texto.startsWith(BOM) ? texto.slice(1) : texto;
  const registros: string[][] = [];
  if (t.length === 0) return registros;

  let registro: string[] = [];
  let campo = '';
  let entreComillas = false;
  // true si se consumió algo desde el último fin de registro.
  let pendiente = false;
  let i = 0;

  const cerrarRegistro = () => {
    registro.push(campo);
    registros.push(registro);
    registro = [];
    campo = '';
    pendiente = false;
  };

  while (i < t.length) {
    const c = t[i];
    pendiente = true;
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        entreComillas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }
    if (c === '"') {
      entreComillas = true;
      i++;
    } else if (c === SEPARADOR) {
      registro.push(campo);
      campo = '';
      i++;
    } else if (c === '\r' || c === '\n') {
      cerrarRegistro();
      i += c === '\r' && t[i + 1] === '\n' ? 2 : 1;
    } else {
      campo += c;
      i++;
    }
  }

  // Último registro sin fin de línea final.
  if (pendiente) cerrarRegistro();

  return registros;
}

/** Envuelve el CSV en un Blob con BOM UTF-8 para que Excel muestre bien las tildes. */
export function csvConBom(texto: string): Blob {
  return new Blob([BOM + texto], { type: 'text/csv;charset=utf-8' });
}
