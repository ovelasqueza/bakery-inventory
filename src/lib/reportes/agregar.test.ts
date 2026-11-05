import { describe, expect, it } from 'vitest';
import { construirReporte, type AutoconsumoReporte, type DatosReporte, type VentaReporte } from './agregar';

function venta(p: Partial<VentaReporte>): VentaReporte {
  return {
    id: 'v',
    creadoEn: '2026-04-11T20:30:00Z',
    total: 5000,
    metodoPagoId: 'efe',
    efectivoRecibido: 5000,
    cambio: 0,
    estado: 'registrada',
    anuladaEn: null,
    anuladaPor: null,
    motivoAnulacion: null,
    turnoId: 't1',
    tipo: 'productos',
    ...p,
  };
}

function auto(p: Partial<AutoconsumoReporte>): AutoconsumoReporte {
  return {
    id: 'a',
    creadoEn: '2026-04-11T20:30:00Z',
    turnoId: 't1',
    consumidoPor: 'Ana',
    nota: null,
    valorReferencia: 0,
    lineas: [],
    ...p,
  };
}

function datos(p: Partial<DatosReporte>): DatosReporte {
  return {
    ventas: [],
    productos: [],
    gastos: [],
    turnos: [],
    metodos: [{ id: 'efe', nombre: 'Efectivo', esEfectivo: true, activo: true }],
    categoriasGasto: [],
    autoconsumos: [],
    ...p,
  };
}

describe('construirReporte: tipo de venta', () => {
  it('pone el texto del tipo en registradas y anuladas', () => {
    const r = construirReporte(
      datos({
        ventas: [
          venta({ id: 'v1', tipo: 'valor' }),
          venta({ id: 'v2', tipo: 'productos' }),
          venta({ id: 'v3', tipo: 'valor', estado: 'anulada' }),
        ],
      }),
    );
    expect(r.ventas.map((v) => [v.id, v.tipoTexto])).toEqual([
      ['v1', 'Venta por valor'],
      ['v2', 'Productos'],
    ]);
    expect(r.anuladas[0].tipoTexto).toBe('Venta por valor');
  });

  it('ordena la fila "Venta por valor" entre los productos y cuadra con el total', () => {
    const r = construirReporte(
      datos({
        ventas: [venta({ id: 'v1', total: 3000, tipo: 'valor' }), venta({ id: 'v2', total: 5000 })],
        productos: [
          { productoId: 'p1', nombre: 'Pan', cantidad: 5, valor: 3000 },
          { productoId: null, nombre: 'Venta por valor', cantidad: 1, valor: 3000 },
          { productoId: 'p2', nombre: 'Gaseosa', cantidad: 1, valor: 2000 },
        ],
      }),
    );
    expect(r.productos.map((p) => p.productoId)).toEqual(['p1', null, 'p2']);
    const suma = r.productos.reduce((s, p) => s + p.valor, 0);
    expect(suma).toBe(r.resumen.totalVendido);
  });
});

describe('construirReporte: autoconsumo', () => {
  const a1 = auto({
    id: 'a1',
    creadoEn: '2026-04-10T15:00:00Z',
    consumidoPor: 'Ana',
    valorReferencia: 3000,
    lineas: [{ productoId: 'p1', nombre: 'Pan viejo', cantidad: 3, precio: 1000, subtotal: 3000 }],
  });
  const a2 = auto({
    id: 'a2',
    creadoEn: '2026-04-11T15:00:00Z',
    consumidoPor: 'Luis',
    nota: 'Desayuno',
    valorReferencia: 4500,
    lineas: [
      { productoId: 'p1', nombre: 'Pan blandito', cantidad: 2, precio: 1000, subtotal: 2000 },
      { productoId: 'p2', nombre: 'Gaseosa', cantidad: 1, precio: 2500, subtotal: 2500 },
    ],
  });

  it('lista del más reciente al más antiguo con el texto de productos', () => {
    const r = construirReporte(datos({ autoconsumos: [a1, a2] }));
    expect(r.autoconsumo.registros.map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(r.autoconsumo.registros[0].productosTexto).toBe('2 × Pan blandito, 1 × Gaseosa');
  });

  it('suma por producto con el nombre más reciente y por persona', () => {
    const r = construirReporte(datos({ autoconsumos: [a1, a2] }));
    expect(r.autoconsumo.porProducto).toEqual([
      { productoId: 'p1', nombre: 'Pan blandito', cantidad: 5, valor: 5000 },
      { productoId: 'p2', nombre: 'Gaseosa', cantidad: 1, valor: 2500 },
    ]);
    expect(r.autoconsumo.porPersona).toEqual([
      { persona: 'Luis', registros: 1, valor: 4500 },
      { persona: 'Ana', registros: 1, valor: 3000 },
    ]);
    expect(r.autoconsumo.total).toBe(7500);
  });

  it('no cambia los totales de dinero ni el vacío', () => {
    const base = datos({ ventas: [venta({ id: 'v1' })] });
    const sin = construirReporte(base);
    const con = construirReporte({ ...base, autoconsumos: [a1, a2] });
    const { autoconsumo: _a, ...restoSin } = sin;
    const { autoconsumo: _b, ...restoCon } = con;
    expect(restoCon).toEqual(restoSin);
    expect(construirReporte(datos({ autoconsumos: [a1] })).vacio).toBe(true);
  });

  it('sin autoconsumos deja listas vacías y total 0', () => {
    const r = construirReporte(datos({}));
    expect(r.autoconsumo).toEqual({ registros: [], porProducto: [], porPersona: [], total: 0 });
  });
});
