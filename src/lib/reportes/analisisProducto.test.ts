import { describe, expect, it } from 'vitest';
import { analizarComportamientoProducto } from './analisisProducto';

describe('analizarComportamientoProducto', () => {
  it('calcula el día de la semana con más ventas y la hora pico del producto', () => {
    const res = analizarComportamientoProducto([
      // 2026-11-15 es Domingo. 12:15 UTC = 7:15 am Bogotá
      { ventaId: 'v1', creadoEn: '2026-11-15T12:15:00Z', cantidad: 10, subtotal: 20000 },
      { ventaId: 'v2', creadoEn: '2026-11-15T12:40:00Z', cantidad: 5, subtotal: 10000 },
      // 2026-11-16 es Lunes. 21:00 UTC = 4:00 pm Bogotá
      { ventaId: 'v3', creadoEn: '2026-11-16T21:00:00Z', cantidad: 4, subtotal: 8000 },
    ]);

    expect(res.totalUnidades).toBe(19);
    expect(res.totalValor).toBe(38000);
    expect(res.totalVentas).toBe(3);
    expect(res.diasConVenta).toBe(2);
    expect(res.mejorDiaSemana?.diaSemana).toBe('Domingo');
    expect(res.mejorDiaSemana?.cantidad).toBe(15);
    expect(res.mejorHora?.hora).toBe(7);
    expect(res.mejorHora?.etiqueta).toBe('7:00 am - 7:59 am');
    expect(res.mejorHora?.cantidad).toBe(15);
  });
});
