import {
  diaLocal,
  etiquetaRangoHora12,
  horaNumeroLocal,
  indiceDiaSemana,
  nombreDiaSemana,
} from '@/lib/fechas/bogota';

export interface LineaProductoTiempo {
  ventaId: string;
  creadoEn: string; // ISO UTC
  cantidad: number;
  subtotal: number;
}

export interface FilaDiaSemanaProducto {
  /** Orden lunes=0 .. domingo=6 para mostrar la semana en orden natural. */
  orden: number;
  diaSemana: string;
  cantidad: number;
  valor: number;
  ventas: number;
  porcentajeUnidades: number;
}

export interface FilaHoraProducto {
  hora: number; // 0..23 Bogotá
  etiqueta: string;
  cantidad: number;
  valor: number;
  ventas: number;
  porcentajeUnidades: number;
}

export interface FilaDiaCalendarioProducto {
  dia: string; // 'AAAA-MM-DD'
  diaSemana: string;
  cantidad: number;
  valor: number;
  ventas: number;
}

export interface AnalisisProducto {
  totalUnidades: number;
  totalValor: number;
  totalVentas: number;
  diasConVenta: number;
  promedioUnidadesPorDiaActivo: number;
  mejorDiaSemana: FilaDiaSemanaProducto | null;
  mejorHora: FilaHoraProducto | null;
  porDiaSemana: FilaDiaSemanaProducto[];
  porHora: FilaHoraProducto[];
  porFecha: FilaDiaCalendarioProducto[];
}

const ORDEN_SEMANA: { indiceUtc: number; nombre: string; orden: number }[] = [
  { indiceUtc: 1, nombre: 'Lunes', orden: 0 },
  { indiceUtc: 2, nombre: 'Martes', orden: 1 },
  { indiceUtc: 3, nombre: 'Miércoles', orden: 2 },
  { indiceUtc: 4, nombre: 'Jueves', orden: 3 },
  { indiceUtc: 5, nombre: 'Viernes', orden: 4 },
  { indiceUtc: 6, nombre: 'Sábado', orden: 5 },
  { indiceUtc: 0, nombre: 'Domingo', orden: 6 },
];

export function analizarComportamientoProducto(lineas: LineaProductoTiempo[]): AnalisisProducto {
  let totalUnidades = 0;
  let totalValor = 0;
  const ventasUnicas = new Set<string>();

  const mapaDiaSemana = new Map<number, { cantidad: number; valor: number; ventas: Set<string> }>();
  for (const d of ORDEN_SEMANA) {
    mapaDiaSemana.set(d.indiceUtc, { cantidad: 0, valor: 0, ventas: new Set() });
  }

  const mapaHora = new Map<number, { cantidad: number; valor: number; ventas: Set<string> }>();
  const mapaFecha = new Map<string, { cantidad: number; valor: number; ventas: Set<string> }>();

  for (const l of lineas) {
    const cant = Number(l.cantidad) || 0;
    const val = Number(l.subtotal) || 0;
    totalUnidades += cant;
    totalValor += val;
    ventasUnicas.add(l.ventaId);

    const dia = diaLocal(l.creadoEn);
    const idxSemana = indiceDiaSemana(dia);
    const hora = horaNumeroLocal(l.creadoEn);

    const regSemana = mapaDiaSemana.get(idxSemana);
    if (regSemana) {
      regSemana.cantidad += cant;
      regSemana.valor += val;
      regSemana.ventas.add(l.ventaId);
    }

    const regHora = mapaHora.get(hora) ?? { cantidad: 0, valor: 0, ventas: new Set<string>() };
    regHora.cantidad += cant;
    regHora.valor += val;
    regHora.ventas.add(l.ventaId);
    mapaHora.set(hora, regHora);

    const regFecha = mapaFecha.get(dia) ?? { cantidad: 0, valor: 0, ventas: new Set<string>() };
    regFecha.cantidad += cant;
    regFecha.valor += val;
    regFecha.ventas.add(l.ventaId);
    mapaFecha.set(dia, regFecha);
  }

  const porDiaSemana: FilaDiaSemanaProducto[] = ORDEN_SEMANA.map((d) => {
    const reg = mapaDiaSemana.get(d.indiceUtc)!;
    return {
      orden: d.orden,
      diaSemana: d.nombre,
      cantidad: reg.cantidad,
      valor: reg.valor,
      ventas: reg.ventas.size,
      porcentajeUnidades: totalUnidades === 0 ? 0 : Math.round((reg.cantidad / totalUnidades) * 1000) / 10,
    };
  });

  const porHora: FilaHoraProducto[] = Array.from(mapaHora.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hora, reg]) => ({
      hora,
      etiqueta: etiquetaRangoHora12(hora),
      cantidad: reg.cantidad,
      valor: reg.valor,
      ventas: reg.ventas.size,
      porcentajeUnidades: totalUnidades === 0 ? 0 : Math.round((reg.cantidad / totalUnidades) * 1000) / 10,
    }));

  const porFecha: FilaDiaCalendarioProducto[] = Array.from(mapaFecha.entries())
    .sort((a, b) => (b[0] < a[0] ? -1 : b[0] > a[0] ? 1 : 0))
    .map(([dia, reg]) => ({
      dia,
      diaSemana: nombreDiaSemana(dia),
      cantidad: reg.cantidad,
      valor: reg.valor,
      ventas: reg.ventas.size,
    }));

  const mejorDiaSemana =
    porDiaSemana
      .filter((d) => d.cantidad > 0)
      .sort((a, b) => b.cantidad - a.cantidad || b.valor - a.valor)[0] ?? null;

  const mejorHora =
    [...porHora].sort((a, b) => b.cantidad - a.cantidad || b.valor - a.valor)[0] ?? null;

  const diasConVenta = porFecha.length;

  return {
    totalUnidades,
    totalValor,
    totalVentas: ventasUnicas.size,
    diasConVenta,
    promedioUnidadesPorDiaActivo: diasConVenta === 0 ? 0 : Math.round((totalUnidades / diasConVenta) * 10) / 10,
    mejorDiaSemana,
    mejorHora,
    porDiaSemana,
    porHora,
    porFecha,
  };
}
