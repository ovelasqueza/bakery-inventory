// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResultadoRecibo } from '@/lib/recibo/imprimir';

import { useImprimirRecibo } from './useImprimirRecibo';

const imprimirReciboCierre = vi.hoisted(() => vi.fn<(turnoId: string) => Promise<ResultadoRecibo>>());

vi.mock('@/lib/recibo/imprimir', async (original) => {
  const real = await original<typeof import('@/lib/recibo/imprimir')>();
  return { ...real, imprimirReciboCierre: (id: string) => imprimirReciboCierre(id) };
});

const estricto = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

afterEach(() => imprimirReciboCierre.mockReset());

describe('useImprimirRecibo', () => {
  it('imprime automáticamente una sola vez en modo estricto (Req 5.1, 5.5)', async () => {
    imprimirReciboCierre.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useImprimirRecibo('t1', true), { wrapper: estricto });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(imprimirReciboCierre).toHaveBeenCalledTimes(1);
    expect(imprimirReciboCierre).toHaveBeenCalledWith('t1');
    expect(result.current.mensaje).toBe('Recibo impreso');
  });

  it('no imprime sin automático e ignora toques mientras imprime (Req 5.3, 5.4)', async () => {
    let resolver: (r: ResultadoRecibo) => void = () => {};
    imprimirReciboCierre.mockImplementation(() => new Promise((r) => (resolver = r)));
    const { result } = renderHook(() => useImprimirRecibo('t2', false));
    expect(result.current.estado).toBe('inactivo');
    expect(imprimirReciboCierre).not.toHaveBeenCalled();

    act(() => result.current.imprimir());
    act(() => result.current.imprimir());
    expect(result.current.estado).toBe('imprimiendo');
    expect(imprimirReciboCierre).toHaveBeenCalledTimes(1);

    await act(async () => resolver({ ok: false, motivo: 'sin_datos' }));
    expect(result.current.estado).toBe('fallo');
    expect(result.current.mensaje).toBe(
      'No se pudieron leer los datos del recibo. El turno sí quedó cerrado.'
    );
  });
});
