/**
 * Exportación de una sección del Modulo_Reportes a CSV y PDF.
 *
 * Ambos formatos salen de `tablasDeSeccion`, igual que la pantalla, así que
 * muestran las mismas columnas y filas (Req 13.2, 13.3).
 *
 * CSV: si la sección tiene varias tablas (Gastos: "Gastos" y "Total por
 * categoría"), la primera es el cuerpo principal del archivo, con su fila de
 * encabezados en la primera línea; las demás se agregan después de una línea
 * en blanco, cada una con su propia fila de encabezados. Así la tabla principal
 * se recupera tal cual leyendo hasta la primera línea vacía (Req 13.5).
 *
 * PDF: el documento se arma completo en memoria y `doc.save` se llama solo al
 * final; si algo falla antes, la función lanza y no se descarga nada (Req 13.7).
 *
 * Requisitos: 13.1, 13.2, 13.3, 13.4, 13.7
 */

import { fechaHora12, type Rango } from '../fechas/bogota';
import type { Reporte } from './agregar';
import { csvConBom, serializarCsv } from './csv';
import { nombreArchivo, tablasDeSeccion, type Seccion } from './tablas';

const TITULO_SECCION: Record<Seccion, string> = {
  resumen: 'Resumen',
  ventas: 'Ventas',
  productos: 'Productos',
  turnos: 'Turnos',
  gastos: 'Gastos',
  metodos: 'Métodos de pago',
  autoconsumo: 'Autoconsumo',
};

/** lz-sage (#2D5A43) para el encabezado de las tablas del PDF. */
const COLOR_ENCABEZADO: [number, number, number] = [45, 90, 67];
/** lz-charcoal (#1F2421). */
const COLOR_TEXTO: [number, number, number] = [31, 36, 33];
/** lz-sage-light (#E9EFEA) para filas alternas. */
const COLOR_FILA_ALTERNA: [number, number, number] = [233, 239, 234];

// Logo original de LIZPAN (copia web de diseno/logo/Logo_lizpan.png)
const LOGO_URL = '/logo-lizpan-original.png';
const LOGO_ANCHO_PX = 320;
const LOGO_ALTO_PX = 160;
const LOGO_TIMEOUT_MS = 5000;

function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Se revoca en el siguiente ciclo para no cortar la descarga en algunos navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Genera y descarga el CSV de la sección. Lanza si algo falla antes de crear el archivo. */
export function exportarCsv(reporte: Reporte, seccion: Seccion, rango: Rango): void {
  const tablas = tablasDeSeccion(reporte, seccion, 'csv');
  if (tablas.length === 0) throw new Error('La sección no tiene tablas');

  const partes = tablas.map((t) => serializarCsv(t.columnas, t.filas));
  // Línea en blanco entre tablas: `\r\n` que cierra la tabla anterior + `\r\n` vacío.
  const texto = partes.join('\r\n\r\n');

  descargarBlob(csvConBom(texto), nombreArchivo(seccion, rango, 'csv'));
}

/** Pasa el logo a PNG (data URL) para el PDF. Devuelve null si no se puede. */
async function logoPng(): Promise<string | null> {
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tiempo agotado cargando el logo')), LOGO_TIMEOUT_MS);
      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error('No se pudo cargar el logo'));
      };
      img.src = LOGO_URL;
    });

    const canvas = document.createElement('canvas');
    canvas.width = LOGO_ANCHO_PX;
    canvas.height = LOGO_ALTO_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Ajusta el logo al canvas conservando la proporción.
    const anchoNat = img.naturalWidth || LOGO_ANCHO_PX;
    const altoNat = img.naturalHeight || LOGO_ALTO_PX;
    const escala = Math.min(LOGO_ANCHO_PX / anchoNat, LOGO_ALTO_PX / altoNat);
    const w = anchoNat * escala;
    const h = altoNat * escala;
    ctx.drawImage(img, (LOGO_ANCHO_PX - w) / 2, (LOGO_ALTO_PX - h) / 2, w, h);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Genera y descarga el PDF de la sección. Lanza si algo falla; no hay descarga parcial. */
export async function exportarPdf(reporte: Reporte, seccion: Seccion, rango: Rango): Promise<void> {
  const tablas = tablasDeSeccion(reporte, seccion, 'pantalla');

  const [{ default: JsPDF }, { default: autoTable }, logo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    logoPng(),
  ]);

  const doc = new JsPDF({ orientation: 'landscape', format: 'letter', unit: 'mm' });
  const margen = 14;
  const altoPagina = doc.internal.pageSize.getHeight();
  let y = margen;

  // Encabezado: logo (o texto de respaldo).
  if (logo) {
    doc.addImage(logo, 'PNG', margen, y, 40, 20);
    y += 24;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...COLOR_ENCABEZADO);
    doc.text('Panadería LIZPAN', margen, y + 6);
    y += 12;
  }

  doc.setTextColor(...COLOR_TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`Reporte: ${TITULO_SECCION[seccion]}`, margen, y + 4);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Rango: ${rango.desde} a ${rango.hasta}`, margen, y);
  y += 6;
  doc.text(`Generado: ${fechaHora12(new Date())}`, margen, y);
  y += 8;

  for (const tabla of tablas) {
    // Si el título no cabe con al menos un par de filas, pasa a la siguiente página.
    if (y > altoPagina - 30) {
      doc.addPage();
      y = margen;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(tabla.titulo, margen, y);
    y += 3;

    let finalY = y;
    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [tabla.columnas],
      body: tabla.filas.map((fila) => fila.map((c) => (c === null ? '' : String(c)))),
      theme: 'striped',
      styles: { fontSize: 9, textColor: COLOR_TEXTO },
      headStyles: { fillColor: COLOR_ENCABEZADO, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: COLOR_FILA_ALTERNA },
      didDrawPage: (data) => {
        finalY = data.cursor?.y ?? finalY;
      },
    });
    y = finalY + 10;
  }

  doc.save(nombreArchivo(seccion, rango, 'pdf'));
}
