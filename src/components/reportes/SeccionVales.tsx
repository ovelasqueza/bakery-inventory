'use client';

// Reporte independiente de Vales de empleados por rango de fechas.
// Muestra el resumen por empleado (para descontar en el pago/nómina al final del mes)
// y el detalle completo con fecha, hora, empleado, tipo (Producto o Dinero de caja),
// descripción y valor.

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useToast } from '@/components/ui';
import { ErrorApp } from '@/lib/api/errores';
import { obtenerValesRango, type Vale } from '@/lib/api/vales';
import { fechaHora12, type Rango } from '@/lib/fechas/bogota';
import { csvConBom, serializarCsv } from '@/lib/reportes/csv';
import type { Tabla } from '@/lib/reportes/tablas';
import { formatCurrency } from '@/lib/utils';
import { TablaReporte } from './TablaReporte';

interface SeccionValesProps {
  rango: Rango;
}

interface ResumenEmpleado {
  empleado: string;
  cantidad: number;
  enProductos: number;
  enEfectivo: number;
  total: number;
}

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
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function SeccionVales({ rango }: SeccionValesProps) {
  const { showToast } = useToast();
  const idFiltroEmpleado = useId();

  const [vales, setVales] = useState<Vale[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<ErrorApp | null>(null);
  const [empleadoFiltro, setEmpleadoFiltro] = useState<string>('todos');
  const [generando, setGenerando] = useState<'pdf' | 'csv' | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await obtenerValesRango(rango);
      setVales(datos);
    } catch (e) {
      setError(e instanceof ErrorApp ? e : new ErrorApp('DESCONOCIDO', e));
    } finally {
      setCargando(false);
    }
  }, [rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const empleadosDisponibles = useMemo(() => {
    const nombres = new Set<string>();
    for (const v of vales) nombres.add(v.empleado);
    return Array.from(nombres).sort((a, b) => a.localeCompare(b, 'es'));
  }, [vales]);

  useEffect(() => {
    if (empleadoFiltro !== 'todos' && !empleadosDisponibles.includes(empleadoFiltro)) {
      setEmpleadoFiltro('todos');
    }
  }, [empleadoFiltro, empleadosDisponibles]);

  const valesFiltrados = useMemo(
    () => (empleadoFiltro === 'todos' ? vales : vales.filter((v) => v.empleado === empleadoFiltro)),
    [vales, empleadoFiltro]
  );

  const resumenPorEmpleado = useMemo<ResumenEmpleado[]>(() => {
    const mapa = new Map<string, ResumenEmpleado>();
    for (const v of valesFiltrados) {
      const actual = mapa.get(v.empleado) ?? {
        empleado: v.empleado,
        cantidad: 0,
        enProductos: 0,
        enEfectivo: 0,
        total: 0,
      };
      actual.cantidad += 1;
      if (v.saleDeCaja) actual.enEfectivo += v.valor;
      else actual.enProductos += v.valor;
      actual.total += v.valor;
      mapa.set(v.empleado, actual);
    }
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total || a.empleado.localeCompare(b.empleado, 'es'));
  }, [valesFiltrados]);

  const totalGeneral = useMemo(() => valesFiltrados.reduce((s, v) => s + v.valor, 0), [valesFiltrados]);
  const totalProductos = useMemo(
    () => valesFiltrados.reduce((s, v) => (!v.saleDeCaja ? s + v.valor : s), 0),
    [valesFiltrados]
  );
  const totalDineroCaja = useMemo(
    () => valesFiltrados.reduce((s, v) => (v.saleDeCaja ? s + v.valor : s), 0),
    [valesFiltrados]
  );

  const tablaResumenPantalla = useMemo<Tabla>(
    () => ({
      titulo: 'Resumen por empleado (para descontar en el pago)',
      columnas: ['Empleado', 'Vales', 'En productos', 'Dinero de caja', 'Total a descontar'],
      filas: resumenPorEmpleado.map((r) => [
        r.empleado,
        r.cantidad,
        formatCurrency(r.enProductos),
        formatCurrency(r.enEfectivo),
        formatCurrency(r.total),
      ]),
    }),
    [resumenPorEmpleado]
  );

  const tablaDetallePantalla = useMemo<Tabla>(
    () => ({
      titulo: 'Detalle de vales (fecha, hora y descripción)',
      columnas: ['Fecha y hora', 'Empleado', 'Tipo', 'Descripción', 'Valor'],
      filas: valesFiltrados.map((v) => [
        fechaHora12(v.creadoEn),
        v.empleado,
        v.saleDeCaja ? 'Dinero de caja' : 'Producto / Consumo',
        v.descripcion,
        formatCurrency(v.valor),
      ]),
    }),
    [valesFiltrados]
  );

  function exportarCsvVales() {
    if (valesFiltrados.length === 0) return;
    setGenerando('csv');
    try {
      const csvResumen = serializarCsv(
        ['Empleado', 'Vales', 'En productos', 'Dinero de caja', 'Total a descontar'],
        resumenPorEmpleado.map((r) => [r.empleado, r.cantidad, r.enProductos, r.enEfectivo, r.total])
      );
      const csvDetalle = serializarCsv(
        ['Fecha y hora', 'Empleado', 'Tipo', 'Descripción', 'Valor'],
        valesFiltrados.map((v) => [
          fechaHora12(v.creadoEn),
          v.empleado,
          v.saleDeCaja ? 'Dinero de caja' : 'Producto / Consumo',
          v.descripcion,
          v.valor,
        ])
      );
      const sufijoEmpleado =
        empleadoFiltro === 'todos' ? '' : `-${empleadoFiltro.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      descargarBlob(
        csvConBom(`${csvResumen}\r\n\r\n${csvDetalle}`),
        `lizpan-vales${sufijoEmpleado}-${rango.desde}-a-${rango.hasta}.csv`
      );
    } catch {
      showToast('No se pudo generar el CSV de vales', 'error');
    } finally {
      setGenerando(null);
    }
  }

  async function exportarPdfVales() {
    if (valesFiltrados.length === 0) return;
    setGenerando('pdf');
    try {
      const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new JsPDF({ orientation: 'landscape', format: 'letter', unit: 'mm' });
      const margen = 14;
      let y = margen;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(45, 90, 67);
      doc.text('Panadería LIZPAN', margen, y + 6);
      y += 12;

      doc.setTextColor(31, 36, 33);
      doc.setFontSize(18);
      doc.text(
        empleadoFiltro === 'todos' ? 'Reporte: Vales de empleados' : `Reporte: Vales de ${empleadoFiltro}`,
        margen,
        y + 4
      );
      y += 10;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Rango: ${rango.desde} a ${rango.hasta}`, margen, y);
      y += 6;
      doc.text(
        `Total a descontar: ${formatCurrency(totalGeneral)} (Productos: ${formatCurrency(totalProductos)} · Dinero de caja: ${formatCurrency(totalDineroCaja)})`,
        margen,
        y
      );
      y += 8;

      for (const tabla of [tablaResumenPantalla, tablaDetallePantalla]) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text(tabla.titulo, margen, y);
        y += 3;

        let finalY = y;
        autoTable(doc, {
          startY: y,
          margin: { left: margen, right: margen },
          head: [tabla.columnas],
          body: tabla.filas.map((f) => f.map((c) => (c === null ? '' : String(c)))),
          theme: 'striped',
          styles: { fontSize: 9, textColor: [31, 36, 33] },
          headStyles: { fillColor: [45, 90, 67], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [233, 239, 234] },
          didDrawPage: (data) => {
            finalY = data.cursor?.y ?? finalY;
          },
        });
        y = finalY + 10;
      }

      const sufijoEmpleado =
        empleadoFiltro === 'todos' ? '' : `-${empleadoFiltro.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      doc.save(`lizpan-vales${sufijoEmpleado}-${rango.desde}-a-${rango.hasta}.pdf`);
    } catch {
      showToast('No se pudo generar el PDF de vales', 'error');
    } finally {
      setGenerando(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lz-border bg-lz-sage-light px-4 py-3 text-sm text-lz-charcoal">
        <p>
          Control independiente de vales para descontar en el pago. Los vales de{' '}
          <span className="font-semibold">Dinero de caja</span> ya se restaron del efectivo esperado de su turno.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={idFiltroEmpleado} className="text-xs font-semibold text-lz-charcoal-muted">
            Empleado:
          </label>
          <select
            id={idFiltroEmpleado}
            value={empleadoFiltro}
            onChange={(e) => setEmpleadoFiltro(e.target.value)}
            className="min-h-[40px] rounded-xl border border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal focus:border-lz-sage focus:outline-none"
          >
            <option value="todos">Todos los empleados ({empleadosDisponibles.length})</option>
            {empleadosDisponibles.map((emp) => (
              <option key={emp} value={emp}>
                {emp}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void exportarPdfVales()}
            disabled={valesFiltrados.length === 0 || generando !== null}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-lz-border bg-lz-surface px-3.5 text-sm font-semibold text-lz-sage shadow-lz-soft transition-colors hover:bg-lz-sage-light disabled:opacity-50"
          >
            {generando === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            onClick={exportarCsvVales}
            disabled={valesFiltrados.length === 0 || generando !== null}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-lz-border bg-lz-surface px-3.5 text-sm font-semibold text-lz-sage shadow-lz-soft transition-colors hover:bg-lz-sage-light disabled:opacity-50"
          >
            {generando === 'csv' ? 'Generando CSV…' : 'Descargar CSV'}
          </button>
        </div>
      </div>

      {/* Tarjetas de totales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft">
          <span className="text-xs font-semibold uppercase tracking-wide text-lz-charcoal-muted">
            Total a descontar ({valesFiltrados.length} {valesFiltrados.length === 1 ? 'vale' : 'vales'})
          </span>
          <span className="font-lz-display text-2xl font-bold tabular-nums text-lz-charcoal">
            {formatCurrency(totalGeneral)}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft">
          <span className="text-xs font-semibold uppercase tracking-wide text-lz-charcoal-muted">
            Por productos / consumo
          </span>
          <span className="font-lz-display text-2xl font-bold tabular-nums text-lz-sage-dark">
            {formatCurrency(totalProductos)}
          </span>
          <span className="text-xs text-lz-charcoal-muted">No sacó efectivo de la caja</span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border border-lz-border bg-lz-surface p-4 shadow-lz-soft">
          <span className="text-xs font-semibold uppercase tracking-wide text-lz-charcoal-muted">
            Dinero sacado de la caja
          </span>
          <span className="font-lz-display text-2xl font-bold tabular-nums text-lz-amber-warm">
            {formatCurrency(totalDineroCaja)}
          </span>
          <span className="text-xs text-lz-charcoal-muted">Restado del cuadre de los turnos</span>
        </div>
      </div>

      {cargando ? (
        <div className="rounded-2xl border border-lz-border bg-lz-surface p-8 text-center text-sm text-lz-charcoal-muted">
          Cargando reporte de vales…
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface p-4"
        >
          <p className="text-sm font-semibold text-lz-danger">No se pudieron cargar los vales del periodo.</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="min-h-[44px] rounded-xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface hover:bg-lz-sage-dark"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <TablaReporte tabla={tablaResumenPantalla} />
          <TablaReporte tabla={tablaDetallePantalla} />
        </>
      )}
    </div>
  );
}

export default SeccionVales;
