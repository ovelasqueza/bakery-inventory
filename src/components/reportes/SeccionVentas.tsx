'use client';

// Ventas por Dia_Local, registradas y anuladas aparte (Req 12.2, 12.7).
// Al elegir una venta registrada se carga su detalle con el precio guardado (Req 12.2).

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { fechaHora12 } from '@/lib/fechas/bogota';
import { ErrorApp } from '@/lib/api/errores';
import { detalleVenta, type DetalleVenta } from '@/lib/api/ventas';
import type { Reporte, VentaConMetodo } from '@/lib/reportes/agregar';
import { tablasDeSeccion } from '@/lib/reportes/tablas';
import { TablaReporte } from './TablaReporte';

// Orden de las tablas de Ventas en formato 'pantalla'.
const INDICE_REGISTRADAS = 1;

function mensajeError(e: unknown): string {
  if (e instanceof ErrorApp && e.codigo === 'SIN_CONEXION') {
    return 'Sin conexión. Revise el internet e intente de nuevo.';
  }
  return 'No se pudo cargar el detalle de la venta. Intente de nuevo.';
}

type EstadoDetalle =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; detalle: DetalleVenta };

interface SeccionVentasProps {
  reporte: Reporte;
}

export function SeccionVentas({ reporte }: SeccionVentasProps) {
  const tablas = useMemo(() => tablasDeSeccion(reporte, 'ventas', 'pantalla'), [reporte]);
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [estado, setEstado] = useState<EstadoDetalle | null>(null);
  const [intento, setIntento] = useState(0);
  const solicitud = useRef(0);

  // Un reporte nuevo invalida la selección.
  useEffect(() => {
    setSeleccionada(null);
    setEstado(null);
  }, [reporte]);

  const venta: VentaConMetodo | null = seleccionada === null ? null : (reporte.ventas[seleccionada] ?? null);

  useEffect(() => {
    if (!venta) return;
    const id = ++solicitud.current;
    setEstado({ tipo: 'cargando' });
    detalleVenta(venta.id)
      .then((detalle) => {
        if (solicitud.current === id) setEstado({ tipo: 'listo', detalle });
      })
      .catch((e: unknown) => {
        if (solicitud.current === id) setEstado({ tipo: 'error', mensaje: mensajeError(e) });
      });
  }, [venta, intento]);

  function seleccionar(i: number) {
    if (i === seleccionada) {
      solicitud.current++;
      setSeleccionada(null);
      setEstado(null);
      return;
    }
    setSeleccionada(i);
  }

  return (
    <div className="flex flex-col gap-4">
      {tablas.map((t, i) =>
        i === INDICE_REGISTRADAS ? (
          <div key={t.titulo} className="flex flex-col gap-4">
            <TablaReporte tabla={t} onSeleccionar={seleccionar} seleccionada={seleccionada} />
            {venta && estado && (
              <DetalleVentaPanel
                venta={venta}
                estado={estado}
                onReintentar={() => setIntento((n) => n + 1)}
                onCerrar={() => seleccionar(seleccionada as number)}
              />
            )}
          </div>
        ) : (
          <TablaReporte key={t.titulo} tabla={t} />
        ),
      )}
    </div>
  );
}

interface DetalleVentaPanelProps {
  venta: VentaConMetodo;
  estado: EstadoDetalle;
  onReintentar: () => void;
  onCerrar: () => void;
}

function DetalleVentaPanel({ venta, estado, onReintentar, onCerrar }: DetalleVentaPanelProps) {
  return (
    <section
      aria-label="Detalle de la venta"
      aria-busy={estado.tipo === 'cargando'}
      className="flex flex-col gap-3 rounded-2xl border-2 border-lz-sage-tint bg-lz-sage-light p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-lz-display text-base font-semibold text-lz-charcoal">Detalle de la venta</h3>
          <p className="text-sm text-lz-charcoal-muted">
            {fechaHora12(venta.creadoEn)} · {venta.metodoNombre}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-[44px] min-w-[44px] rounded-2xl border-2 border-lz-border bg-lz-surface px-3 text-sm font-semibold text-lz-charcoal hover:border-lz-sage-medium"
        >
          Cerrar
        </button>
      </div>

      {estado.tipo === 'cargando' && (
        <p role="status" className="text-sm text-lz-charcoal-muted">
          Cargando detalle…
        </p>
      )}

      {estado.tipo === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-lz-danger-border bg-lz-danger-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm font-medium text-lz-danger">{estado.mensaje}</p>
          <button
            type="button"
            onClick={onReintentar}
            className="min-h-[44px] rounded-2xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface hover:bg-lz-sage-dark"
          >
            Reintentar
          </button>
        </div>
      )}

      {estado.tipo === 'listo' && <ContenidoDetalle detalle={estado.detalle} />}
    </section>
  );
}

function ContenidoDetalle({ detalle }: { detalle: DetalleVenta }) {
  const v = detalle.venta;
  const celdaNum = 'whitespace-nowrap px-3 py-2 text-right font-lz-display tabular-nums text-lz-charcoal';
  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-max border-collapse rounded-xl bg-lz-surface text-sm">
          <thead>
            <tr className="border-b-2 border-lz-border">
              <th scope="col" className="px-3 py-2 text-left font-semibold text-lz-charcoal-muted">
                Producto
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold text-lz-charcoal-muted">
                Cantidad
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold text-lz-charcoal-muted">
                Precio
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold text-lz-charcoal-muted">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {detalle.detalles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-center text-lz-charcoal-muted">
                  Sin registros
                </td>
              </tr>
            ) : (
              // Linea_Valor (sin producto): "Venta por valor" con su valor (barra-acciones-caja Req 11.3).
              detalle.detalles.map((d, i) => (
                <tr key={i} className="border-b border-lz-border last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2 text-lz-charcoal">
                    {d.productoId === null ? 'Venta por valor' : d.nombreProducto}
                  </td>
                  <td className={celdaNum}>{d.cantidad}</td>
                  <td className={celdaNum}>{formatCurrency(d.precioUnitario)}</td>
                  <td className={celdaNum}>{formatCurrency(d.subtotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Dato etiqueta="Total" valor={formatCurrency(v.total)} />
        {v.esEfectivo && <Dato etiqueta="Efectivo recibido" valor={formatCurrency(v.efectivoRecibido)} />}
        {v.esEfectivo && <Dato etiqueta="Cambio" valor={formatCurrency(v.cambio)} />}
      </dl>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-xl bg-lz-surface px-3 py-2">
      <dt className="text-sm text-lz-charcoal-muted">{etiqueta}</dt>
      <dd className="font-lz-display text-base font-semibold tabular-nums text-lz-charcoal">{valor}</dd>
    </div>
  );
}

export default SeccionVentas;
