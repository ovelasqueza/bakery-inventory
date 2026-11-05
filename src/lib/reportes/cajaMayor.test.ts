import { describe, expect, it } from 'vitest';
import type { MovimientoMayor, ParteCajaMayor } from '@/lib/api/cajaMayor';
import {
  COLUMNAS_MOVIMIENTOS,
  esGastoEliminable,
  ordenarMovimientos,
  partesVisibles,
  tablaMovimientos,
  totalSaldos,
  valorConSigno,
} from './cajaMayor';

function mov(p: Partial<MovimientoMayor>): MovimientoMayor {
  return {
    id: 'm',
    creadoEn: '2026-04-11T20:30:00Z',
    tipo: 'gasto',
    parteId: 'p1',
    parteNombre: 'Efectivo',
    valor: -5000,
    saldoDespues: 15000,
    persona: 'Ana',
    descripcion: 'Harina',
    turnoId: null,
    gastoId: 'g1',
    gastoEliminado: false,
    ...p,
  };
}

const parte = (p: Partial<ParteCajaMayor>): ParteCajaMayor => ({
  parteId: 'p',
  metodoPagoId: null,
  nombre: 'Efectivo',
  activo: true,
  saldo: 0,
  ...p,
});

describe('esGastoEliminable', () => {
  it('solo acepta gastos sin turno, con gasto y no eliminados', () => {
    expect(esGastoEliminable(mov({}))).toBe(true);
    expect(esGastoEliminable(mov({ turnoId: 't1' }))).toBe(false);
    expect(esGastoEliminable(mov({ gastoId: null }))).toBe(false);
    expect(esGastoEliminable(mov({ gastoEliminado: true }))).toBe(false);
    expect(esGastoEliminable(mov({ tipo: 'eliminacion_gasto' }))).toBe(false);
    expect(esGastoEliminable(mov({ tipo: 'ajuste' }))).toBe(false);
  });
});

describe('partesVisibles y totalSaldos', () => {
  it('oculta partes inactivas con saldo 0 y suma todas', () => {
    const partes = [
      parte({ parteId: 'a', saldo: 1000 }),
      parte({ parteId: 'b', metodoPagoId: 'n', nombre: 'Nequi', activo: false, saldo: 0 }),
      parte({ parteId: 'c', metodoPagoId: 'd', nombre: 'Daviplata', activo: false, saldo: 500 }),
      parte({ parteId: 'd', metodoPagoId: 'x', nombre: 'Tarjeta', activo: true, saldo: 0 }),
    ];
    expect(partesVisibles(partes).map((p) => p.parteId)).toEqual(['a', 'c', 'd']);
    expect(totalSaldos(partes)).toBe(1500);
  });
});

describe('ordenarMovimientos', () => {
  it('pone primero el más reciente y conserva el orden en empates', () => {
    const lista = [
      mov({ id: '1', creadoEn: '2026-04-10T10:00:00Z' }),
      mov({ id: '2', creadoEn: '2026-04-11T10:00:00Z' }),
      mov({ id: '3', creadoEn: '2026-04-11T10:00:00Z' }),
    ];
    expect(ordenarMovimientos(lista).map((m) => m.id)).toEqual(['2', '3', '1']);
  });
});

describe('tablaMovimientos', () => {
  it('usa hora de 12 h de Bogotá y deja valor y saldo como números', () => {
    const t = tablaMovimientos([mov({ persona: null, descripcion: null })]);
    expect(t.columnas).toEqual(COLUMNAS_MOVIMIENTOS);
    expect(t.filas[0]).toEqual(['2026-04-11 3:30 pm', 'Gasto', 'Efectivo', -5000, 15000, '', '', '']);
  });

  it('valorConSigno marca entradas con + y salidas con -', () => {
    expect(valorConSigno(1000).startsWith('+')).toBe(true);
    expect(valorConSigno(-1000).startsWith('-')).toBe(true);
  });
});
