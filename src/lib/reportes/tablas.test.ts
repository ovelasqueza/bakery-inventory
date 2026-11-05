import { describe, expect, it } from 'vitest';
import { construirReporte, type DatosReporte, type VentaReporte } from './agregar';
import { seccionVacia, tablasDeSeccion } from './tablas';

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

const conAutoconsumo = datos({
  autoconsumos: [
    {
      id: 'a1',
      creadoEn: '2026-04-11T20:48:00Z', // 3:48 pm en Bogotá
      turnoId: 't1',
      consumidoPor: 'Ana',
      nota: 'Desayuno',
      valorReferencia: 4500,
      lineas: [
        { productoId: 'p1', nombre: 'Pan blandito', cantidad: 2, precio: 1000, subtotal: 2000 },
        { productoId: 'p2', nombre: 'Gaseosa', cantidad: 1, precio: 2500, subtotal: 2500 },
      ],
    },
  ],
});

describe('tablasDeSeccion: columna Tipo en Ventas', () => {
  const r = construirReporte(
    datos({
      ventas: [
        venta({ id: 'v1', tipo: 'valor' }),
        venta({ id: 'v2', tipo: 'productos', estado: 'anulada', motivoAnulacion: 'Error' }),
      ],
    }),
  );

  it('pantalla: después de Total en registradas y en anuladas', () => {
    const [, registradas, anuladas] = tablasDeSeccion(r, 'ventas', 'pantalla');
    expect(registradas.columnas).toEqual(['Fecha y hora', 'Total', 'Tipo', 'Método de pago']);
    expect(registradas.filas[0][2]).toBe('Venta por valor');
    expect(anuladas.columnas[2]).toBe('Tipo');
    expect(anuladas.filas[0][2]).toBe('Productos');
  });

  it('CSV: después de Estado', () => {
    const [tabla] = tablasDeSeccion(r, 'ventas', 'csv');
    expect(tabla.columnas.slice(0, 4)).toEqual(['Fecha y hora', 'Estado', 'Tipo', 'Total']);
    expect(tabla.filas.map((f) => f[2])).toEqual(['Venta por valor', 'Productos']);
  });
});

describe('tablasDeSeccion: Autoconsumo', () => {
  const r = construirReporte(conAutoconsumo);

  it('arma las tres tablas con las mismas columnas y filas en pantalla y CSV', () => {
    const pantalla = tablasDeSeccion(r, 'autoconsumo', 'pantalla');
    const csv = tablasDeSeccion(r, 'autoconsumo', 'csv');
    expect(pantalla.map((t) => t.titulo)).toEqual(['Autoconsumo', 'Por producto', 'Por persona']);
    expect(pantalla[0].columnas).toEqual(['Fecha y hora', 'Consumió', 'Productos', 'Nota', 'Valor a precio de venta']);
    expect(pantalla[1].columnas).toEqual(['Producto', 'Cantidad', 'Valor a precio de venta']);
    expect(pantalla[2].columnas).toEqual(['Persona', 'Registros', 'Valor a precio de venta']);
    expect(csv.map((t) => t.columnas)).toEqual(pantalla.map((t) => t.columnas));
    expect(csv.map((t) => t.filas.length)).toEqual(pantalla.map((t) => t.filas.length));
  });

  it('CSV usa AAAA-MM-DD HH:mm y enteros; pantalla usa 12 horas', () => {
    const [csv] = tablasDeSeccion(r, 'autoconsumo', 'csv');
    expect(csv.filas[0]).toEqual(['2026-04-11 15:48', 'Ana', '2 × Pan blandito, 1 × Gaseosa', 'Desayuno', 4500]);
    const [pantalla] = tablasDeSeccion(r, 'autoconsumo', 'pantalla');
    expect(String(pantalla.filas[0][0])).toMatch(/3:48/);
    expect(typeof pantalla.filas[0][4]).toBe('string');
  });
});

describe('seccionVacia', () => {
  it('Autoconsumo mira solo sus registros', () => {
    expect(seccionVacia(construirReporte(conAutoconsumo), 'autoconsumo')).toBe(false);
    expect(seccionVacia(construirReporte(conAutoconsumo), 'ventas')).toBe(true);
    const soloVentas = construirReporte(datos({ ventas: [venta({})] }));
    expect(seccionVacia(soloVentas, 'autoconsumo')).toBe(true);
    expect(seccionVacia(soloVentas, 'resumen')).toBe(false);
  });

  it('Turnos nunca está vacía', () => {
    expect(seccionVacia(construirReporte(datos({})), 'turnos')).toBe(false);
  });
});
