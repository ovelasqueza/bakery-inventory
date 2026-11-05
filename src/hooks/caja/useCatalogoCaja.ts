'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApp, traducirError } from '@/lib/api/errores';
import { obtenerCatalogoCaja, type CategoriaCaja } from '@/lib/api/ventas';
import { compararProductos, type ProductoCaja } from '@/lib/caja/busqueda';

export type EstadoCatalogo = 'cargando' | 'error' | 'listo';

export interface CatalogoCajaHook {
  estado: EstadoCatalogo;
  /** Productos ordenados con `compararProductos`; vacío mientras carga o si falló. */
  productos: ProductoCaja[];
  categorias: CategoriaCaja[];
  error: ErrorApp | null;
  /** Vuelve a leer el catálogo (botón "Reintentar", Req 4.10). */
  recargar: () => Promise<void>;
}

const VACIO_PRODUCTOS: ProductoCaja[] = [];
const VACIO_CATEGORIAS: CategoriaCaja[] = [];

/**
 * Lee el catálogo de Caja en cada carga (Req 4.1). La lista se publica completa o no se publica:
 * mientras carga o tras un error no se muestran productos (Req 4.10).
 */
export function useCatalogoCaja(): CatalogoCajaHook {
  const [estado, setEstado] = useState<EstadoCatalogo>('cargando');
  const [productos, setProductos] = useState<ProductoCaja[]>(VACIO_PRODUCTOS);
  const [categorias, setCategorias] = useState<CategoriaCaja[]>(VACIO_CATEGORIAS);
  const [error, setError] = useState<ErrorApp | null>(null);

  const montado = useRef(true);
  const ultimaLectura = useRef(0);

  const recargar = useCallback(async () => {
    const id = ++ultimaLectura.current;
    setEstado('cargando');
    setError(null);
    setProductos(VACIO_PRODUCTOS);
    setCategorias(VACIO_CATEGORIAS);
    try {
      const catalogo = await obtenerCatalogoCaja();
      if (!montado.current || id !== ultimaLectura.current) return;
      setProductos([...catalogo.productos].sort(compararProductos));
      setCategorias(catalogo.categorias);
      setEstado('listo');
    } catch (e) {
      if (!montado.current || id !== ultimaLectura.current) return;
      setError(traducirError(e));
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    void recargar();
    return () => {
      montado.current = false;
    };
  }, [recargar]);

  return { estado, productos, categorias, error, recargar };
}
