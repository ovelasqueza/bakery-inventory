/**
 * Tablas de cada sección del Modulo_Reportes.
 *
 * La pantalla, el PDF y el CSV salen de `tablasDeSeccion`, así que muestran
 * las mismas columnas y filas (Req 13.2, 13.3, 13.5). Solo cambia el formato:
 * - `pantalla` (y PDF): montos con `formatCurrency`.
 * - `csv`: montos como enteros de COP sin símbolo ni separador de miles.
 * En ambos formatos las fechas van como `AAAA-MM-DD HH:mm` en Dia_Local
 * (Req 13.4) y las celdas sin dato son `null` (campo vacío).
 *
 * En Ventas, el CSV tiene una sola tabla con una fila por Venta, incluidas las
 * Venta_Anulada con su estado, motivo y Persona_Caja (Req 13.3); la pantalla
 * muestra por día, registradas y anuladas por separado (Req 12.2, 12.7).
 *
 * Requisitos: 12.2, 13.2, 13.3, 13.4, 13.5; barra-acciones-caja 11.2, 12.4, 12.5, 12.6
 */

import { formatCurrency } from '@/lib/utils';
import { fechaHora12, fechaHoraLocal, type Rango } from '../fechas/bogota';
import type { Celda } from './csv';
import type { Reporte, VentaConMetodo } from './agregar';

export type { Celda } from './csv';

export type Seccion = 'resumen' | 'ventas' | 'productos' | 'turnos' | 'gastos' | 'metodos' | 'autoconsumo';

export type Tabla = { titulo: string; columnas: string[]; filas: Celda[][] };

type Formato = 'pantalla' | 'csv';

function monto(valor: number | null, formato: Formato): Celda {
  if (valor === null) return null;
  return formato === 'csv' ? Math.round(valor) : formatCurrency(valor);
}

/** Pantalla y PDF: 12 horas (3:48 pm). CSV: AAAA-MM-DD HH:mm (Req 13.4). */
function fecha(iso: string | null, formato: Formato): Celda {
  if (iso === null) return null;
  return formato === 'csv' ? fechaHoraLocal(iso) : fechaHora12(iso);
}

function resumen(r: Reporte, f: Formato): Tabla[] {
  const s = r.resumen;
  return [
    {
      titulo: 'Resumen',
      columnas: ['Indicador', 'Valor'],
      filas: [
        ['Total vendido', monto(s.totalVendido, f)],
        ['Número de ventas', s.numeroVentas],
        ['Promedio por venta', monto(s.promedio, f)],
        ['Total gastos', monto(s.totalGastos, f)],
        ['Vendido menos gastos', monto(s.neto, f)],
      ],
    },
  ];
}

function ventas(r: Reporte, f: Formato): Tabla[] {
  if (f === 'csv') {
    const fila = (v: VentaConMetodo): Celda[] => [
      fecha(v.creadoEn, f),
      v.estado === 'anulada' ? 'Anulada' : 'Registrada',
      v.tipoTexto,
      monto(v.total, f),
      v.metodoNombre,
      v.motivoAnulacion,
      v.anuladaPor,
      fecha(v.anuladaEn, f),
    ];
    return [
      {
        titulo: 'Ventas',
        columnas: [
          'Fecha y hora',
          'Estado',
          'Tipo',
          'Total',
          'Método de pago',
          'Motivo',
          'Anulada por',
          'Fecha anulación',
        ],
        filas: [...r.ventas, ...r.anuladas].map(fila),
      },
    ];
  }
  return [
    {
      titulo: 'Ventas por día',
      columnas: ['Día', 'Total', 'Ventas'],
      filas: r.porDia.map((d) => [d.dia, monto(d.total, f), d.cantidad]),
    },
    {
      titulo: 'Ventas registradas',
      columnas: ['Fecha y hora', 'Total', 'Tipo', 'Método de pago'],
      filas: r.ventas.map((v) => [fecha(v.creadoEn, f), monto(v.total, f), v.tipoTexto, v.metodoNombre]),
    },
    {
      titulo: 'Ventas anuladas',
      columnas: ['Fecha y hora', 'Total', 'Tipo', 'Motivo', 'Anulada por', 'Fecha anulación'],
      filas: r.anuladas.map((v) => [
        fecha(v.creadoEn, f),
        monto(v.total, f),
        v.tipoTexto,
        v.motivoAnulacion,
        v.anuladaPor,
        fecha(v.anuladaEn, f),
      ]),
    },
  ];
}

function productos(r: Reporte, f: Formato): Tabla[] {
  return [
    {
      titulo: 'Productos vendidos',
      columnas: ['Producto', 'Cantidad', 'Valor vendido'],
      filas: r.productos.map((p) => [p.nombre, p.cantidad, monto(p.valor, f)]),
    },
  ];
}

function turnos(r: Reporte, f: Formato): Tabla[] {
  // Una columna por Metodo_Pago que aparece en algún Turno, en orden de aparición.
  const metodos: { id: string; nombre: string }[] = [];
  const vistos = new Set<string>();
  for (const t of r.turnos) {
    for (const m of t.porMetodo) {
      if (!vistos.has(m.metodoPagoId)) {
        vistos.add(m.metodoPagoId);
        metodos.push({ id: m.metodoPagoId, nombre: m.nombre });
      }
    }
  }

  return [
    {
      titulo: 'Turnos',
      columnas: [
        'Estado',
        'Abrió',
        'Apertura',
        'Cerró',
        'Cierre',
        'Base',
        ...metodos.map((m) => m.nombre),
        'Total ventas',
        'Gastos',
        'Retiros',
        'Efectivo esperado',
        'Efectivo contado',
        'Diferencia',
        'Base dejada',
        'Enviado a caja mayor',
      ],
      filas: r.turnos.map((t) => {
        const abierto = t.estado === 'Abierto';
        const porMetodo = new Map(t.porMetodo.map((m) => [m.metodoPagoId, m.total]));
        return [
          t.estado,
          t.abiertoPor,
          fecha(t.abiertoEn, f),
          abierto ? null : t.cerradoPor,
          abierto ? null : fecha(t.cerradoEn, f),
          monto(t.base, f),
          ...metodos.map((m) => monto(porMetodo.get(m.id) ?? 0, f)),
          monto(t.totalVentas, f),
          monto(t.totalGastos, f),
          monto(t.totalRetiros, f),
          monto(t.efectivoEsperado, f),
          abierto ? null : monto(t.efectivoContado, f),
          abierto ? null : monto(t.diferencia, f),
          // Vacías en abiertos y en cerrados antes de la Caja mayor (Req 9.4).
          abierto ? null : monto(t.baseSiguiente, f),
          abierto ? null : monto(t.enviadoMayor, f),
        ];
      }),
    },
  ];
}

function gastos(r: Reporte, f: Formato): Tabla[] {
  return [
    {
      titulo: 'Gastos',
      columnas: ['Fecha y hora', 'Concepto', 'Categoría', 'Registrado por', 'Valor', 'Origen'],
      filas: r.gastos.map((g) => [
        fecha(g.creadoEn, f),
        g.concepto,
        g.categoriaNombre,
        g.registradoPor,
        monto(g.valor, f),
        g.origenTexto,
      ]),
    },
    {
      titulo: 'Total por categoría',
      columnas: ['Categoría', 'Total'],
      filas: r.gastosPorCategoria.map((c) => [c.nombre, monto(c.total, f)]),
    },
  ];
}

function metodos(r: Reporte, f: Formato): Tabla[] {
  return [
    {
      titulo: 'Métodos de pago',
      columnas: ['Método de pago', 'Total vendido', 'Ventas'],
      filas: r.porMetodo.map((m) => [m.nombre, monto(m.total, f), m.cantidad]),
    },
  ];
}

const VALOR_REFERENCIA = 'Valor a precio de venta';

/** Autoconsumos no anulados del rango; valores a precio de venta, no dinero (Req 12.2–12.5). */
function autoconsumo(r: Reporte, f: Formato): Tabla[] {
  const a = r.autoconsumo;
  return [
    {
      titulo: 'Autoconsumo',
      columnas: ['Fecha y hora', 'Consumió', 'Productos', 'Nota', VALOR_REFERENCIA],
      filas: a.registros.map((x) => [
        fecha(x.creadoEn, f),
        x.consumidoPor,
        x.productosTexto,
        x.nota,
        monto(x.valorReferencia, f),
      ]),
    },
    {
      titulo: 'Por producto',
      columnas: ['Producto', 'Cantidad', VALOR_REFERENCIA],
      filas: a.porProducto.map((p) => [p.nombre, p.cantidad, monto(p.valor, f)]),
    },
    {
      titulo: 'Por persona',
      columnas: ['Persona', 'Registros', VALOR_REFERENCIA],
      filas: a.porPersona.map((p) => [p.persona, p.registros, monto(p.valor, f)]),
    },
  ];
}

/**
 * Si la sección no tiene datos que mostrar ni exportar (Req 12.6, 12.10).
 * Autoconsumo mira solo sus registros; Turnos nunca está vacía (puede mostrar
 * turnos abiertos sin ventas ni gastos); las demás usan `r.vacio`.
 */
export function seccionVacia(r: Reporte, s: Seccion): boolean {
  if (s === 'autoconsumo') return r.autoconsumo.registros.length === 0;
  if (s === 'turnos') return false;
  return r.vacio;
}

export function tablasDeSeccion(r: Reporte, s: Seccion, formato: Formato): Tabla[] {
  switch (s) {
    case 'resumen':
      return resumen(r, formato);
    case 'ventas':
      return ventas(r, formato);
    case 'productos':
      return productos(r, formato);
    case 'turnos':
      return turnos(r, formato);
    case 'gastos':
      return gastos(r, formato);
    case 'metodos':
      return metodos(r, formato);
    case 'autoconsumo':
      return autoconsumo(r, formato);
  }
}

/** `reporte-{seccion}-{desde}-{hasta}.{ext}` con fechas AAAA-MM-DD (Req 13.2, 13.3). */
export function nombreArchivo(s: Seccion, r: Rango, ext: 'pdf' | 'csv'): string {
  return `reporte-${s}-${r.desde}-${r.hasta}.${ext}`;
}
