/**
 * Agregación pura de los datos de `reporte_rango` para el Modulo_Reportes.
 *
 * - Las Venta_Anulada se listan aparte y se excluyen de todos los totales
 *   y conteos (Req 7.4, 12.7).
 * - Ventas y Gastos se asignan al Dia_Local de su registro (Req 12.8).
 * - La suma por día, por producto y por método es igual a
 *   `resumen.totalVendido`; la suma por categoría es igual a
 *   `resumen.totalGastos` (Req 12.9).
 * - Los Autoconsumos se agregan aparte (`autoconsumo`) y no entran en ningún
 *   total de dinero (barra-acciones-caja Req 12.7).
 *
 * Requisitos: 7.4, 12.1–12.7, 12.9, 12.10; barra-acciones-caja 11.1, 11.4, 12.2, 12.3, 12.7
 */

import { formatCurrency } from '@/lib/utils';
import { textoProductos } from '../caja/autoconsumo';
import { textoOrigen } from '../caja/cajaMayor';
import { diaLocal } from '../fechas/bogota';

// ---------------------------------------------------------------------------
// Datos de entrada (forma de `reporte_rango` en camelCase)
// ---------------------------------------------------------------------------

export type EstadoVenta = 'registrada' | 'anulada';

/** `'valor'` = Venta_Por_Valor (sin productos); `'productos'` en ventas antiguas. */
export type TipoVentaReporte = 'productos' | 'valor';

export type VentaReporte = {
  id: string;
  creadoEn: string; // ISO UTC
  total: number;
  metodoPagoId: string;
  efectivoRecibido: number;
  cambio: number;
  estado: EstadoVenta;
  anuladaEn: string | null;
  anuladaPor: string | null;
  motivoAnulacion: string | null;
  turnoId: string;
  tipo: TipoVentaReporte;
};

export type ProductoVendido = {
  productoId: string | null; // null = grupo "Venta por valor"
  nombre: string;
  cantidad: number;
  valor: number;
};

export type GastoReporte = {
  id: string;
  creadoEn: string; // ISO UTC
  valor: number;
  concepto: string;
  categoriaGastoId: string;
  registradoPor: string;
  turnoId: string | null; // null = Gasto_Sin_Turno
  origenes: OrigenReporte[]; // vacío en gastos antiguos (100 % Cajón)
};

/** Origen de un gasto; `parteId = null` es Cajón. */
export type OrigenReporte = { parteId: string | null; nombre: string; valor: number };

export type TurnoReporte = {
  id: string;
  abiertoPor: string;
  abiertoEn: string; // ISO UTC
  cerradoPor: string | null;
  cerradoEn: string | null; // null = Turno_Abierto
  base: number;
  efectivoContado: number | null;
  efectivoEsperado: number; // para abiertos, calculado al momento
  diferencia: number | null;
  porMetodo: { metodoPagoId: string; total: number }[];
  totalGastos: number;
  totalRetiros: number;
  baseSiguiente: number | null; // null en abiertos y cerrados antiguos
  enviadoMayor: number | null; // null en abiertos y cerrados antiguos
};

export type MetodoReporte = { id: string; nombre: string; esEfectivo: boolean; activo: boolean };
export type CategoriaGastoReporte = { id: string; nombre: string; activo: boolean };

/** Línea de un Autoconsumo; `precio` es el precio de venta copiado al registrar (solo referencia). */
export type LineaAutoconsumoReporte = {
  productoId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
};

/** Autoconsumo no anulado del rango; no es dinero (Req 11.1, 11.2). */
export type AutoconsumoReporte = {
  id: string;
  creadoEn: string; // ISO UTC
  turnoId: string;
  consumidoPor: string;
  nota: string | null;
  valorReferencia: number;
  lineas: LineaAutoconsumoReporte[];
};

export type DatosReporte = {
  ventas: VentaReporte[]; // todas las del rango, incluidas anuladas
  productos: ProductoVendido[]; // agregados en SQL, sin anuladas
  gastos: GastoReporte[]; // no eliminados del rango
  turnos: TurnoReporte[]; // abiertos en el rango
  metodos: MetodoReporte[]; // incluidos inactivos
  categoriasGasto: CategoriaGastoReporte[]; // incluidas inactivas
  autoconsumos: AutoconsumoReporte[]; // no anulados del rango, creado_en asc
};

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type TipoVentaTexto = 'Productos' | 'Venta por valor';

/** Venta con el nombre de su Metodo_Pago y el texto de su tipo resueltos (Req 11.2). */
export type VentaConMetodo = VentaReporte & { metodoNombre: string; tipoTexto: TipoVentaTexto };

/** Autoconsumo con sus productos como texto ("2 × Pan blandito, 1 × Gaseosa") (Req 12.2). */
export type FilaAutoconsumo = AutoconsumoReporte & { productosTexto: string };

/** Totales de Autoconsumo a precio de venta; no es dinero (Req 12.3, 12.7). */
export type AutoconsumoAgregado = {
  registros: FilaAutoconsumo[]; // más reciente primero
  porProducto: { productoId: string; nombre: string; cantidad: number; valor: number }[]; // valor desc, nombre asc
  porPersona: { persona: string; registros: number; valor: number }[]; // valor desc, persona asc
  total: number;
};

/**
 * Gasto con el nombre de su Categoria_Gasto resuelto y el texto de su origen
 * ("Cajón", nombre de una Parte o "Cajón $ 20.000 + Nequi $ 30.000") (Req 9.2).
 */
export type GastoConCategoria = GastoReporte & { categoriaNombre: string; origenTexto: string };

export type EstadoTurno = 'Abierto' | 'Cerrado';

export type FilaTurno = {
  id: string;
  estado: EstadoTurno;
  abiertoPor: string;
  abiertoEn: string;
  cerradoPor: string | null; // null si Abierto
  cerradoEn: string | null; // null si Abierto
  base: number;
  porMetodo: { metodoPagoId: string; nombre: string; total: number }[];
  totalVentas: number;
  totalGastos: number;
  totalRetiros: number;
  efectivoEsperado: number;
  efectivoContado: number | null; // null si Abierto
  diferencia: number | null; // null si Abierto
  baseSiguiente: number | null; // null si Abierto o cerrado antes de la Caja mayor
  enviadoMayor: number | null; // null si Abierto o cerrado antes de la Caja mayor
};

export type ResumenReporte = {
  totalVendido: number;
  numeroVentas: number;
  promedio: number;
  totalGastos: number;
  neto: number;
};

export type Reporte = {
  resumen: ResumenReporte;
  porDia: { dia: string; total: number; cantidad: number }[]; // dia asc
  ventas: VentaConMetodo[]; // registradas, más reciente primero
  anuladas: VentaConMetodo[]; // más reciente primero
  productos: ProductoVendido[]; // valor desc, nombre asc
  turnos: FilaTurno[]; // apertura más reciente primero
  gastos: GastoConCategoria[]; // más reciente primero
  gastosPorCategoria: { categoriaId: string; nombre: string; total: number }[]; // total desc, nombre asc
  porMetodo: { metodoPagoId: string; nombre: string; total: number; cantidad: number }[]; // total desc, nombre asc
  autoconsumo: AutoconsumoAgregado; // fuera de todos los totales de dinero
  vacio: boolean; // sin ventas (incluidas anuladas) ni gastos; no mira autoconsumos
};

// ---------------------------------------------------------------------------
// Ayudantes
// ---------------------------------------------------------------------------

const SIN_NOMBRE = '(sin nombre)';

function tiempo(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, 'es');
}

/** Más reciente primero; a igual fecha, por id para que el orden sea estable. */
function masRecientePrimero<T extends { id: string }>(fecha: (x: T) => string) {
  return (a: T, b: T): number => {
    const d = tiempo(fecha(b)) - tiempo(fecha(a));
    if (d !== 0) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

function porTotalDescNombreAsc<T extends { total: number; nombre: string }>(a: T, b: T): number {
  return b.total - a.total || compararTexto(a.nombre, b.nombre);
}

// ---------------------------------------------------------------------------
// Autoconsumo (Req 12.2, 12.3, 12.7)
// ---------------------------------------------------------------------------

function porValorDescYTexto<T extends { valor: number }>(texto: (x: T) => string, id: (x: T) => string) {
  return (a: T, b: T): number => {
    const d = b.valor - a.valor || compararTexto(texto(a), texto(b));
    if (d !== 0) return d;
    const ia = id(a);
    const ib = id(b);
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  };
}

/**
 * Lista y totales de los Autoconsumos no anulados del rango. Es un valor a precio de venta:
 * no entra en ningún total de ventas, gastos, métodos ni turnos (Req 12.7).
 */
function agregarAutoconsumos(lista: AutoconsumoReporte[]): AutoconsumoAgregado {
  const registros = lista
    .map((a): FilaAutoconsumo => ({
      ...a,
      lineas: a.lineas.map((l) => ({ ...l })),
      productosTexto: textoProductos(a.lineas),
    }))
    .sort(masRecientePrimero<FilaAutoconsumo>((a) => a.creadoEn));

  // Se recorre del más reciente al más antiguo: el primer nombre visto es el más reciente.
  const productos = new Map<string, { productoId: string; nombre: string; cantidad: number; valor: number }>();
  const personas = new Map<string, { persona: string; registros: number; valor: number }>();
  for (const a of registros) {
    for (const l of a.lineas) {
      const fila = productos.get(l.productoId) ?? {
        productoId: l.productoId,
        nombre: l.nombre,
        cantidad: 0,
        valor: 0,
      };
      fila.cantidad += l.cantidad;
      fila.valor += l.subtotal;
      productos.set(l.productoId, fila);
    }
    const fila = personas.get(a.consumidoPor) ?? { persona: a.consumidoPor, registros: 0, valor: 0 };
    fila.registros += 1;
    fila.valor += a.valorReferencia;
    personas.set(a.consumidoPor, fila);
  }

  return {
    registros,
    porProducto: Array.from(productos.values()).sort(
      porValorDescYTexto((p) => p.nombre, (p) => p.productoId),
    ),
    porPersona: Array.from(personas.values()).sort(
      porValorDescYTexto((p) => p.persona, (p) => p.persona),
    ),
    total: registros.reduce((s, a) => s + a.valorReferencia, 0),
  };
}

// ---------------------------------------------------------------------------
// construirReporte
// ---------------------------------------------------------------------------

export function construirReporte(d: DatosReporte): Reporte {
  const nombreMetodo = new Map(d.metodos.map((m) => [m.id, m.nombre]));
  const nombreCategoria = new Map(d.categoriasGasto.map((c) => [c.id, c.nombre]));

  const conMetodo = (v: VentaReporte): VentaConMetodo => ({
    ...v,
    metodoNombre: nombreMetodo.get(v.metodoPagoId) ?? SIN_NOMBRE,
    tipoTexto: v.tipo === 'valor' ? 'Venta por valor' : 'Productos',
  });

  const ordenVentas = masRecientePrimero<VentaConMetodo>((v) => v.creadoEn);

  const registradas = d.ventas.filter((v) => v.estado === 'registrada').map(conMetodo).sort(ordenVentas);
  const anuladas = d.ventas.filter((v) => v.estado === 'anulada').map(conMetodo).sort(ordenVentas);

  // Resumen (Req 12.1)
  const totalVendido = registradas.reduce((s, v) => s + v.total, 0);
  const numeroVentas = registradas.length;
  const totalGastos = d.gastos.reduce((s, g) => s + g.valor, 0);
  const resumen: ResumenReporte = {
    totalVendido,
    numeroVentas,
    promedio: numeroVentas === 0 ? 0 : Math.round(totalVendido / numeroVentas),
    totalGastos,
    neto: totalVendido - totalGastos,
  };

  // Por Dia_Local (Req 12.2, 12.8)
  const dias = new Map<string, { dia: string; total: number; cantidad: number }>();
  for (const v of registradas) {
    const dia = diaLocal(v.creadoEn);
    const fila = dias.get(dia) ?? { dia, total: 0, cantidad: 0 };
    fila.total += v.total;
    fila.cantidad += 1;
    dias.set(dia, fila);
  }
  const porDia = Array.from(dias.values()).sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));

  // Productos (Req 12.3); el grupo "Venta por valor" (productoId nulo) desempata como ''.
  const productos = d.productos
    .map((p) => ({ ...p }))
    .sort((a, b) => {
      const ia = a.productoId ?? '';
      const ib = b.productoId ?? '';
      return b.valor - a.valor || compararTexto(a.nombre, b.nombre) || (ia < ib ? -1 : ia > ib ? 1 : 0);
    });

  // Por Metodo_Pago, incluidos inactivos (Req 12.6)
  const metodos = new Map<string, { metodoPagoId: string; nombre: string; total: number; cantidad: number }>();
  for (const v of registradas) {
    const fila = metodos.get(v.metodoPagoId) ?? {
      metodoPagoId: v.metodoPagoId,
      nombre: v.metodoNombre,
      total: 0,
      cantidad: 0,
    };
    fila.total += v.total;
    fila.cantidad += 1;
    metodos.set(v.metodoPagoId, fila);
  }
  const porMetodo = Array.from(metodos.values()).sort(porTotalDescNombreAsc);

  // Gastos (Req 12.5), incluidos los Gasto_Sin_Turno; origen como texto (Req 9.2)
  const gastos = d.gastos
    .map((g): GastoConCategoria => {
      const nombresParte = new Map<string, string>();
      for (const o of g.origenes) {
        if (o.parteId !== null && o.nombre) nombresParte.set(o.parteId, o.nombre);
      }
      return {
        ...g,
        categoriaNombre: nombreCategoria.get(g.categoriaGastoId) ?? SIN_NOMBRE,
        origenTexto: textoOrigen(
          g.origenes.map((o) => ({ parteId: o.parteId, valor: o.valor })),
          nombresParte,
          formatCurrency,
        ),
      };
    })
    .sort(masRecientePrimero<GastoConCategoria>((g) => g.creadoEn));

  const categorias = new Map<string, { categoriaId: string; nombre: string; total: number }>();
  for (const g of gastos) {
    const fila = categorias.get(g.categoriaGastoId) ?? {
      categoriaId: g.categoriaGastoId,
      nombre: g.categoriaNombre,
      total: 0,
    };
    fila.total += g.valor;
    categorias.set(g.categoriaGastoId, fila);
  }
  const gastosPorCategoria = Array.from(categorias.values()).sort(porTotalDescNombreAsc);

  // Turnos (Req 12.4)
  const turnos = d.turnos
    .map((t): FilaTurno => {
      const abierto = t.cerradoEn === null;
      const efectivoEsperado = t.efectivoEsperado - t.base;
      const diferencia = abierto || t.efectivoContado === null ? null : t.efectivoContado - efectivoEsperado;
      return {
        id: t.id,
        estado: abierto ? 'Abierto' : 'Cerrado',
        abiertoPor: t.abiertoPor,
        abiertoEn: t.abiertoEn,
        cerradoPor: abierto ? null : t.cerradoPor,
        cerradoEn: abierto ? null : t.cerradoEn,
        base: 0,
        porMetodo: t.porMetodo.map((m) => ({
          metodoPagoId: m.metodoPagoId,
          nombre: nombreMetodo.get(m.metodoPagoId) ?? SIN_NOMBRE,
          total: m.total,
        })),
        totalVentas: t.porMetodo.reduce((s, m) => s + m.total, 0),
        totalGastos: t.totalGastos,
        totalRetiros: t.totalRetiros,
        efectivoEsperado,
        efectivoContado: abierto ? null : t.efectivoContado,
        diferencia,
        baseSiguiente: abierto ? null : t.baseSiguiente,
        enviadoMayor: abierto ? null : t.enviadoMayor,
      };
    })
    .sort(masRecientePrimero<FilaTurno>((t) => t.abiertoEn));

  return {
    resumen,
    porDia,
    ventas: registradas,
    anuladas,
    productos,
    turnos,
    gastos,
    gastosPorCategoria,
    porMetodo,
    autoconsumo: agregarAutoconsumos(d.autoconsumos),
    // Las anuladas cuentan como movimiento para no esconder su lista (Req 12.10).
    vacio: d.ventas.length === 0 && d.gastos.length === 0,
  };
}
