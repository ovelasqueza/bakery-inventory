'use client';

// Pantalla de Caja: máquina de estados del punto de venta (design "Estados de la Caja" y
// "Vistas de PuntoVenta"; Req 1.1, 1.2, 1.5, 1.6, 1.9, 3.1, 4.7, 4.8, 5.2, 5.5, 5.7, 5.8,
// 8.1, 8.2, 8.5, 9.6, 9.9).
//
// Cargando → ErrorCarga | SinTurno | Vendiendo
// SinTurno → Vendiendo (turno abierto o existente)
// Vendiendo → Cobrando | Cerrando | Autoconsumo | Calculadora; Ventas, Gastos y Retiro se abren
//   encima de Vendiendo. Todas se abren desde el Grupo_Acciones del encabezado; tocar la activa
//   vuelve a Vendiendo.
// Cobrando → Vendiendo (cancelar o venta registrada) | SinTurno (TURNO_CERRADO, se conserva el Carrito)
// Calculadora: "Cobrar" registra de una con el Metodo_Escogido y sigue en la Calculadora
//   (ajustes-caja-encabezado Req 6) | SinTurno (TURNO_CERRADO, se conserva la Lista_Valores)
// El botón "Abrir cajón" es flotante y está en todos los estados con medidas de ventana (Req 4.1).
// Autoconsumo: la cuadrícula suma a la Seleccion_Autoconsumo; "Registrar" abre el diálogo.
// Cerrando → Vendiendo (cancelar) | ResumenCierre (cerrado) | SinTurno (ya_cerrado)
// ResumenCierre → SinTurno
//
// El Pedido_Productos, la Lista_Valores y la Seleccion_Autoconsumo viven aquí, por separado,
// y se conservan al cambiar de vista y con TURNO_CERRADO.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '@/components/ui';
import { AbrirTurno } from '@/components/caja/AbrirTurno';
import { AvisoSinConexion } from '@/components/caja/AvisoSinConexion';
import { BarraAccionesCaja, type AccionCaja } from '@/components/caja/BarraAccionesCaja';
import { BarraBusqueda } from '@/components/caja/BarraBusqueda';
import { BotonAbrirCajon } from '@/components/caja/BotonAbrirCajon';
import { CalculadoraVenta, textoAvisoCalculadora } from '@/components/caja/CalculadoraVenta';
import { CierreTurno } from '@/components/caja/CierreTurno';
import { ConfirmacionVenta } from '@/components/caja/ConfirmacionVenta';
import { CuadriculaProductos } from '@/components/caja/CuadriculaProductos';
import { DialogoAutoconsumo } from '@/components/caja/DialogoAutoconsumo';
import { DialogoRetiro } from '@/components/caja/DialogoRetiro';
import { EncabezadoCaja } from '@/components/caja/EncabezadoCaja';
import { FranjaAutoconsumo } from '@/components/caja/FranjaAutoconsumo';
import { EstadoVacioCaja } from '@/components/caja/EstadoVacioCaja';
import { ListaAutoconsumosTurno } from '@/components/caja/ListaAutoconsumosTurno';
import { ListaVentasTurno } from '@/components/caja/ListaVentasTurno';
import { PanelCarrito } from '@/components/caja/PanelCarrito';
import { PanelCobro, type AccionConfirmarCobro } from '@/components/caja/PanelCobro';
import { PanelGastos } from '@/components/caja/PanelGastos';
import { PanelValores } from '@/components/caja/PanelValores';
import { ResultadoCierre } from '@/components/caja/ResultadoCierre';
import { useBusquedaDiferida } from '@/hooks/caja/useBusquedaDiferida';
import { useCajon } from '@/hooks/caja/useCajon';
import { useCatalogoCaja } from '@/hooks/caja/useCatalogoCaja';
import { useCobroDirecto } from '@/hooks/caja/useCobroDirecto';
import { useLayoutCaja } from '@/hooks/caja/useLayoutCaja';
import { useTurnoCaja } from '@/hooks/caja/useTurnoCaja';
import type { Cierre, TurnoAbierto } from '@/lib/api/turnos';
import type { VentaRegistrada } from '@/lib/api/ventas';
import { filtrarProductos, type ProductoCaja } from '@/lib/caja/busqueda';
import {
  CALCULADORA_INICIAL,
  reducirCalculadora,
  valoresParaCobrar,
  type AccionCalculadora,
  type AvisoCalculadora,
  type EstadoCalculadora,
} from '@/lib/caja/calculadora';
import {
  CANTIDAD_MAX,
  conciliarCarrito,
  reducirCarrito,
  type AccionCarrito,
  type Carrito,
  type ResultadoCarrito,
} from '@/lib/caja/carrito';
import type { MetodoPagoParam } from '@/lib/api/parametros';
import { metodoPorDefecto, metodoVigente, type PedidoCobro } from '@/lib/caja/cobro';
import { MEDIDAS } from '@/lib/caja/layout';

/** Lo que se muestra encima o en lugar de la cuadrícula con el turno abierto. */
type Vista =
  | 'vendiendo'
  | 'cobrando'
  | 'cerrando'
  | 'ventas'
  | 'gastos'
  | 'retiro'
  | 'autoconsumo' // cuadrícula + Seleccion_Autoconsumo
  | 'calculadora'; // teclado + PanelValores (cobro directo)

/** Vista que abre cada Boton_Accion. */
const VISTA_DE_ACCION: Record<AccionCaja, Vista> = {
  ventas: 'ventas',
  gastos: 'gastos',
  retiro: 'retiro',
  autoconsumo: 'autoconsumo',
  calculadora: 'calculadora',
  cerrar: 'cerrando',
};

/**
 * Boton_Accion resaltado según la vista (Req 1.6). Cerrar turno no se marca activo: conserva su tono de peligro (y su ventana lo tapa).
 */
function accionActiva(vista: Vista): AccionCaja | null {
  switch (vista) {
    case 'ventas':
    case 'gastos':
    case 'retiro':
    case 'autoconsumo':
    case 'calculadora':
      return vista;
    default:
      return null;
  }
}

const ESPERA_BUSQUEDA_MS = 150;
const CARRITO_VACIO: Carrito = [];
const SIN_METODOS: MetodoPagoParam[] = [];

function Cargando({ texto }: { texto: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="h-10 w-10 animate-spin rounded-full border-4 border-lz-sage border-t-transparent"
        />
        <span className="text-base font-semibold text-lz-charcoal-muted">{texto}</span>
      </div>
    </div>
  );
}

function listarNombres(nombres: string[]): string {
  return nombres.join(', ');
}

/** Lista de Carrito con su referencia, para devolver el resultado al instante. */
function useListaCarrito() {
  const [lista, setLista] = useState<Carrito>(CARRITO_VACIO);
  const ref = useRef<Carrito>(CARRITO_VACIO);

  const despachar = useCallback((accion: AccionCarrito): ResultadoCarrito => {
    const r = reducirCarrito(ref.current, accion);
    if (r.carrito !== ref.current) {
      ref.current = r.carrito;
      setLista(r.carrito);
    }
    return r;
  }, []);

  return { lista, ref, despachar };
}

export function PuntoVenta() {
  const { showToast } = useToast();
  const layout = useLayoutCaja();
  const { estado, turno, parametros, error, recargar, setTurno } = useTurnoCaja();
  const catalogo = useCatalogoCaja();
  const { abrirSiCorresponde } = useCajon({
    cajonAlCobrar: parametros?.cajonAlCobrar ?? false,
    cajonEnTurno: parametros?.cajonEnTurno ?? false,
  });

  const [vista, setVista] = useState<Vista>('vendiendo');
  /** Cierre exitoso y el turno que se cerró (para imprimir su recibo, Req 5.1). */
  const [cierre, setCierre] = useState<{ cierre: Cierre; turnoId: string } | null>(null);
  const [confirmacion, setConfirmacion] = useState<{ total: number; cambio: number | null } | null>(null);
  /** Panel derecho expandido en móvil (Pedido, Autoconsumo o Valores). */
  const [panelExpandido, setPanelExpandido] = useState(false);
  const [dialogoAutoconsumo, setDialogoAutoconsumo] = useState(false);
  const [listaAutoconsumos, setListaAutoconsumos] = useState(false);
  const [confirmacionCobro, setConfirmacionCobro] = useState<AccionConfirmarCobro | null>(null);

  // ---------------------------------------------------------------------------
  // Pedido_Productos y Seleccion_Autoconsumo: dos Carritos separados (Req 8.5).
  // ---------------------------------------------------------------------------
  const { lista: carrito, ref: carritoRef, despachar } = useListaCarrito();
  const { lista: seleccion, ref: seleccionRef, despachar: despacharSeleccion } = useListaCarrito();

  const cantidades = useMemo(() => new Map(carrito.map((l) => [l.productoId, l.cantidad] as const)), [carrito]);
  const cantidadesSeleccion = useMemo(
    () => new Map(seleccion.map((l) => [l.productoId, l.cantidad] as const)),
    [seleccion]
  );
  const pedidoProductos = useMemo<PedidoCobro>(() => ({ tipo: 'productos', carrito }), [carrito]);

  const agregarA = useCallback(
    (despacho: (a: AccionCarrito) => ResultadoCarrito, p: ProductoCaja) => {
      const r = despacho({ tipo: 'agregar', producto: { id: p.id, nombre: p.nombre, precio: p.precio } });
      if (r.aviso === 'CANTIDAD_MAXIMA') showToast(`Cantidad máxima: ${CANTIDAD_MAX}`, 'warning');
    },
    [showToast]
  );
  const agregar = useCallback((p: ProductoCaja) => agregarA(despachar, p), [agregarA, despachar]);
  const agregarSeleccion = useCallback(
    (p: ProductoCaja) => agregarA(despacharSeleccion, p),
    [agregarA, despacharSeleccion]
  );

  // ---------------------------------------------------------------------------
  // Calculadora: Valor_Digitado y Lista_Valores, aparte del Pedido_Productos (Req 4.7, 4.8).
  // ---------------------------------------------------------------------------
  const [calculadora, setCalculadora] = useState<EstadoCalculadora>(CALCULADORA_INICIAL);
  const calculadoraRef = useRef<EstadoCalculadora>(CALCULADORA_INICIAL);

  const fijarCalculadora = useCallback((e: EstadoCalculadora) => {
    if (e === calculadoraRef.current) return;
    calculadoraRef.current = e;
    setCalculadora(e);
  }, []);

  // Metodo_Escogido de la Calculadora: se conserva mientras siga activo; si no, el de por
  // defecto (Req 5.2, 5.4).
  const metodosPago = parametros?.metodosPago ?? SIN_METODOS;
  const [metodoValorId, setMetodoValorId] = useState<string | null>(null);
  const metodoValorVigenteId = useMemo(
    () => metodoVigente(metodosPago, metodoValorId),
    [metodosPago, metodoValorId]
  );

  // ---------------------------------------------------------------------------
  // Búsqueda y filtro del catálogo (compartidos por Vendiendo y Autoconsumo)
  // ---------------------------------------------------------------------------
  const [texto, setTexto] = useState('');
  const [categoriaId, setCategoriaId] = useState<string | 'todas'>('todas');
  const textoDiferido = useBusquedaDiferida(texto, ESPERA_BUSQUEDA_MS);
  const filtrados = useMemo(
    () => filtrarProductos(catalogo.productos, textoDiferido, categoriaId),
    [catalogo.productos, textoDiferido, categoriaId]
  );

  const limpiarBusqueda = useCallback(() => {
    setTexto('');
    setCategoriaId('todas');
  }, []);

  // ---------------------------------------------------------------------------
  // Productos cambiados: recargar el catálogo y conciliar la lista afectada cuando llegue
  // (PRECIOS_ACTUALIZADOS / PRODUCTO_NO_DISPONIBLE del cobro, o del autoconsumo; Req 9.6).
  // ---------------------------------------------------------------------------
  const conciliarPendiente = useRef({ pedido: false, seleccion: false });

  const recargarCatalogo = catalogo.recargar;
  const alPreciosActualizados = useCallback(() => {
    conciliarPendiente.current.pedido = true;
    void recargarCatalogo();
  }, [recargarCatalogo]);

  const alProductosAutoconsumoCambiaron = useCallback(() => {
    conciliarPendiente.current.seleccion = true;
    void recargarCatalogo();
  }, [recargarCatalogo]);

  useEffect(() => {
    const pendiente = conciliarPendiente.current;
    if ((!pendiente.pedido && !pendiente.seleccion) || catalogo.estado !== 'listo') return;
    conciliarPendiente.current = { pedido: false, seleccion: false };
    const partes: string[] = [];

    if (pendiente.pedido) {
      const anterior = carritoRef.current;
      const { carrito: nuevo, retirados, conPrecioNuevo } = conciliarCarrito(anterior, catalogo.productos);
      despachar({ tipo: 'reemplazar', carrito: nuevo });

      const nombreAnterior = new Map(anterior.map((l) => [l.productoId, l.nombre] as const));
      const nombreNuevo = new Map(nuevo.map((l) => [l.productoId, l.nombre] as const));
      if (conPrecioNuevo.length > 0) {
        partes.push(`Precio nuevo: ${listarNombres(conPrecioNuevo.map((id) => nombreNuevo.get(id) ?? id))}`);
      }
      if (retirados.length > 0) {
        partes.push(`Ya no disponible: ${listarNombres(retirados.map((id) => nombreAnterior.get(id) ?? id))}`);
      }
    }

    if (pendiente.seleccion) {
      // En el autoconsumo el precio es solo referencia: se avisa solo lo que se quitó.
      const anterior = seleccionRef.current;
      const { carrito: nuevo, retirados } = conciliarCarrito(anterior, catalogo.productos);
      despacharSeleccion({ tipo: 'reemplazar', carrito: nuevo });

      const nombreAnterior = new Map(anterior.map((l) => [l.productoId, l.nombre] as const));
      if (retirados.length > 0) {
        partes.push(
          `Se quitaron del autoconsumo: ${listarNombres(retirados.map((id) => nombreAnterior.get(id) ?? id))}`
        );
      }
    }

    showToast(partes.length > 0 ? `${partes.join('. ')}.` : 'Se actualizaron los productos.', 'warning');
  }, [catalogo.estado, catalogo.productos, carritoRef, seleccionRef, despachar, despacharSeleccion, showToast]);

  // ---------------------------------------------------------------------------
  // Turno
  // ---------------------------------------------------------------------------
  // Si el turno desaparece (cierre en otro dispositivo, TURNO_CERRADO) se vuelve a la apertura
  // conservando las tres listas; al reabrir se empieza en Vendiendo.
  useEffect(() => {
    if (turno) return;
    setVista('vendiendo');
    setPanelExpandido(false);
    setDialogoAutoconsumo(false);
    setListaAutoconsumos(false);
  }, [turno]);

  // Al cambiar de vista el panel de móvil empieza contraído.
  useEffect(() => {
    setPanelExpandido(false);
  }, [vista]);

  const alTurnoCerrado = useCallback(() => {
    showToast('El turno fue cerrado', 'warning');
    setVista('vendiendo');
    setTurno(null);
  }, [setTurno, showToast]);

  /** Para los componentes que ya avisaron "El turno ya fue cerrado". */
  const alTurnoCerradoAvisado = useCallback(() => {
    setVista('vendiendo');
    setTurno(null);
  }, [setTurno]);

  const alAbierto = useCallback(
    (t: TurnoAbierto) => {
      setVista('vendiendo');
      setTurno(t);
    },
    [setTurno]
  );

  const alRegistrada = useCallback(
    (venta: VentaRegistrada) => {
      despachar({ tipo: 'vaciar' });
      setVista('vendiendo');
      setConfirmacion({ total: venta.total, cambio: venta.cambio });
    },
    [despachar]
  );

  const alCerrado = useCallback(
    (c: Cierre) => {
      despachar({ tipo: 'vaciar' });
      if (turno) setCierre({ cierre: c, turnoId: turno.id });
    },
    [despachar, turno]
  );

  const alContinuarCierre = useCallback(() => {
    setCierre(null);
    setVista('vendiendo');
    setTurno(null);
  }, [setTurno]);

  const alYaCerrado = useCallback(() => {
    setVista('vendiendo');
    setTurno(null);
  }, [setTurno]);

  const abrirCajonCobro = useCallback(() => abrirSiCorresponde('cobro_efectivo'), [abrirSiCorresponde]);
  const abrirCajonTurno = useCallback(() => abrirSiCorresponde('turno'), [abrirSiCorresponde]);

  // ---------------------------------------------------------------------------
  // Cobro directo de la Calculadora (Req 6): "Cobrar" registra con el Metodo_Escogido.
  // La Lista_Valores vive aquí: ante cualquier error (también TURNO_CERRADO) se conserva.
  // ---------------------------------------------------------------------------
  const alRegistradaValor = useCallback(
    (venta: VentaRegistrada) => {
      // Mientras registra, despacharCalculadora no tiene efecto: se vacía directo (Req 6.8).
      fijarCalculadora(reducirCalculadora(calculadoraRef.current, { tipo: 'vaciar' }).estado);
      setMetodoValorId(metodoPorDefecto(metodosPago));
      setConfirmacion({ total: venta.total, cambio: null }); // sin cambio: no se sabe cuánto entregó
    },
    [fijarCalculadora, metodosPago]
  );

  const cobro = useCobroDirecto({
    turnoId: turno?.id ?? '',
    onRegistrada: alRegistradaValor,
    onTurnoCerrado: alTurnoCerrado,
    abrirCajon: abrirCajonCobro,
  });
  const { registrando: registrandoValor, limpiarError: limpiarErrorValor, cobrar: cobrarDirecto } = cobro;

  // Teclas, "Quitar" y "Borrar todo" no tienen efecto mientras registra (Req 6.7).
  // Un cambio en la Lista_Valores borra el error del último intento.
  const despacharCalculadora = useCallback(
    (accion: AccionCalculadora): { estado: EstadoCalculadora; aviso?: AvisoCalculadora } => {
      const anterior = calculadoraRef.current;
      if (registrandoValor) return { estado: anterior };
      const r = reducirCalculadora(anterior, accion);
      fijarCalculadora(r.estado);
      if (r.estado.valores !== anterior.valores) limpiarErrorValor();
      return r;
    },
    [fijarCalculadora, limpiarErrorValor, registrandoValor]
  );

  const escogerMetodoValor = useCallback(
    (id: string) => {
      if (registrandoValor) return;
      setMetodoValorId(id);
      limpiarErrorValor();
    },
    [limpiarErrorValor, registrandoValor]
  );

  /** Registra la Lista_Valores dada con el Metodo_Escogido. */
  const registrarValores = useCallback(
    (valores: number[]) => {
      const metodo = metodosPago.find((m) => m.id === metodoValorVigenteId && m.activo);
      if (!metodo) {
        showToast('No hay métodos de pago activos', 'warning');
        return;
      }
      void cobrarDirecto(valores, { id: metodo.id, esEfectivo: metodo.esEfectivo });
    },
    [cobrarDirecto, metodoValorVigenteId, metodosPago, showToast]
  );

  // Cobrar en la Calculadora: el Valor_Digitado pendiente se agrega antes (Req 6.1, 6.2).
  const cobrarValor = useCallback(() => {
    if (registrandoValor) return;
    const r = valoresParaCobrar(calculadoraRef.current);
    if (!r.ok) {
      showToast(textoAvisoCalculadora(r.aviso), 'warning');
      return;
    }
    fijarCalculadora(r.estado);
    registrarValores(r.valores);
  }, [fijarCalculadora, registrarValores, registrandoValor, showToast]);

  // Reintento sin conexión: misma lista y método, así se reutiliza la clave (Req 6.10).
  const reintentarValor = useCallback(() => {
    if (registrandoValor) return;
    const valores = calculadoraRef.current.valores.map((v) => v.valor);
    if (valores.length === 0) return;
    registrarValores(valores);
  }, [registrarValores, registrandoValor]);

  const volverAVender = useCallback(() => setVista('vendiendo'), []);
  const sinCambios = useCallback(() => undefined, []);

  // Barra_Acciones: abre la vista del botón; el de la vista activa vuelve a Vendiendo (Req 1.6).
  const alAccion = useCallback((accion: AccionCaja) => {
    setVista((v) => (accionActiva(v) === accion ? 'vendiendo' : VISTA_DE_ACCION[accion]));
  }, []);

  const cobrar = useCallback(() => {
    if (carritoRef.current.length === 0) return;
    setVista('cobrando');
  }, [carritoRef]);

  // Si el pedido queda vacío durante el cobro, se vuelve a Vendiendo.
  useEffect(() => {
    if (vista === 'cobrando' && carrito.length === 0) setVista('vendiendo');
  }, [vista, carrito.length]);

  // ---------------------------------------------------------------------------
  // Autoconsumo
  // ---------------------------------------------------------------------------
  const abrirDialogoAutoconsumo = useCallback(() => {
    if (seleccionRef.current.length === 0) return;
    setPanelExpandido(false);
    setDialogoAutoconsumo(true);
  }, [seleccionRef]);
  const cerrarDialogoAutoconsumo = useCallback(() => setDialogoAutoconsumo(false), []);
  const alAutoconsumoRegistrado = useCallback(() => despacharSeleccion({ tipo: 'vaciar' }), [despacharSeleccion]);
  const abrirListaAutoconsumos = useCallback(() => setListaAutoconsumos(true), []);
  const cerrarListaAutoconsumos = useCallback(() => setListaAutoconsumos(false), []);

  // Fuera de Autoconsumo no quedan sus ventanas abiertas; sin selección no hay qué registrar.
  useEffect(() => {
    if (vista !== 'autoconsumo') {
      setDialogoAutoconsumo(false);
      setListaAutoconsumos(false);
    }
  }, [vista]);
  useEffect(() => {
    if (seleccion.length === 0) setDialogoAutoconsumo(false);
  }, [seleccion.length]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  // Cargando: sin medidas de ventana o sin turno y parámetros todavía.
  if (!layout || estado === 'cargando') {
    return (
      <div className="fixed inset-0 overflow-hidden bg-lz-linen">
        <Cargando texto="Cargando caja…" />
      </div>
    );
  }

  // Todos los estados con medidas de ventana llevan el botón flotante para abrir el cajón
  // (error de carga, sin turno, con turno y resumen de cierre; Req 4.1, 4.2).
  const posicionCajon = { left: layout.cajonFlotante.left, bottom: layout.cajonFlotante.bottom };
  const contenedor = (hijos: ReactNode) => (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-lz-linen text-lz-charcoal"
      style={{ height: layout.altoVentana }}
    >
      {hijos}
      <BotonAbrirCajon variante="flotante" posicion={posicionCajon} />
    </div>
  );

  // ErrorCarga
  if (estado === 'error' || !parametros) {
    const sinConexion = error?.codigo === 'SIN_CONEXION';
    return contenedor(
      <>
        <EncabezadoCaja layout={layout} />
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
          <div className="flex w-full max-w-md flex-col gap-4">
            {sinConexion ? (
              <AvisoSinConexion
                mensaje="No se pudo cargar la caja. Revise el internet y vuelva a intentar."
                onReintentar={() => void recargar()}
              />
            ) : (
              <div
                role="alert"
                className="flex flex-col items-center gap-3 rounded-3xl border border-lz-danger-border bg-lz-danger-surface p-6 text-center"
              >
                <p className="font-lz-display text-lg font-bold text-lz-danger">No se pudo cargar la caja</p>
                <p className="text-sm text-lz-charcoal">Intente de nuevo.</p>
                <button
                  type="button"
                  onClick={() => void recargar()}
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-lz-sage px-5 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark"
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ResumenCierre
  if (cierre) {
    return contenedor(
      <ResultadoCierre cierre={cierre.cierre} turnoId={cierre.turnoId} onContinuar={alContinuarCierre} />
    );
  }

  // SinTurno: sin Grupo_Acciones (Req 1.2)
  if (!turno) {
    return contenedor(
      <>
        <EncabezadoCaja layout={layout} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AbrirTurno
            personas={parametros.personas}
            onAbierto={alAbierto}
            abrirCajon={abrirCajonTurno}
          />
        </div>
      </>
    );
  }

  // Con turno: Vendiendo y las demás vistas
  const esMovil = layout.modo === 'movil';
  const enAutoconsumo = vista === 'autoconsumo';
  const enCalculadora = vista === 'calculadora';
  const reservaInferior = layout.cajonFlotante.reserva;

  let zonaProductos: ReactNode;
  if (catalogo.estado === 'cargando') {
    zonaProductos = <Cargando texto="Cargando productos…" />;
  } else if (catalogo.estado === 'error') {
    zonaProductos = <EstadoVacioCaja variante="error" onReintentar={() => void catalogo.recargar()} />;
  } else if (catalogo.productos.length === 0) {
    zonaProductos = <EstadoVacioCaja variante="sin-productos" />;
  } else if (filtrados.length === 0) {
    zonaProductos = <EstadoVacioCaja variante="sin-coincidencias" onLimpiar={limpiarBusqueda} />;
  } else {
    zonaProductos = (
      <CuadriculaProductos
        productos={filtrados}
        columnas={layout.columnas}
        cantidades={enAutoconsumo ? cantidadesSeleccion : cantidades}
        onAgregar={enAutoconsumo ? agregarSeleccion : agregar}
        reservaInferior={reservaInferior}
        modo={enAutoconsumo ? 'autoconsumo' : 'venta'}
      />
    );
  }

  let zonaIzquierda: ReactNode;
  if (vista === 'cobrando') {
    // Cobro en la misma pantalla: reemplaza la cuadrícula y el pedido sigue a la vista.
    zonaIzquierda = (
      <PanelCobro
        key="cobro-productos"
        abierto
        pedido={pedidoProductos}
        turnoId={turno.id}
        metodos={parametros.metodosPago}
        onCancelar={volverAVender}
        onRegistrada={alRegistrada}
        onTurnoCerrado={alTurnoCerrado}
        onPreciosActualizados={alPreciosActualizados}
        abrirCajon={abrirCajonCobro}
        reservaInferior={reservaInferior}
        onCambioConfirmacion={setConfirmacionCobro}
      />
    );
  } else if (vista === 'calculadora') {
    zonaIzquierda = (
      <CalculadoraVenta
        estado={calculadora}
        despachar={despacharCalculadora}
        onCobrar={cobrarValor}
        layout={layout}
        reservaInferior={reservaInferior}
        registrando={registrandoValor}
        onVolver={volverAVender}
      />
    );
  } else {
    zonaIzquierda = (
      <>
        <div
          className="flex shrink-0 flex-col gap-2"
          style={{ paddingLeft: MEDIDAS.padding, paddingRight: MEDIDAS.padding, paddingTop: MEDIDAS.padding }}
        >
          {enAutoconsumo && <FranjaAutoconsumo onSalir={volverAVender} onVerTurno={abrirListaAutoconsumos} />}
          <BarraBusqueda
            texto={texto}
            onTexto={setTexto}
            categorias={catalogo.categorias}
            categoriaId={categoriaId}
            onCategoria={setCategoriaId}
          />
        </div>
        <div className="min-h-0 flex-1">{zonaProductos}</div>
      </>
    );
  }

  let panelDerecho: ReactNode;
  if (enCalculadora) {
    panelDerecho = (
      <PanelValores
        estado={calculadora}
        layout={layout}
        despachar={despacharCalculadora}
        onCobrar={cobrarValor}
        metodos={metodosPago}
        metodoId={metodoValorVigenteId}
        onMetodo={escogerMetodoValor}
        registrando={registrandoValor}
        error={cobro.error}
        onReintentar={reintentarValor}
        expandido={panelExpandido}
        onExpandir={setPanelExpandido}
      />
    );
  } else if (enAutoconsumo) {
    panelDerecho = (
      <PanelCarrito
        key="autoconsumo"
        carrito={seleccion}
        layout={layout}
        despachar={despacharSeleccion}
        onCobrar={abrirDialogoAutoconsumo}
        expandido={panelExpandido}
        onExpandir={setPanelExpandido}
        modo="autoconsumo"
        textoVacio="Toca los productos consumidos."
      />
    );
  } else {
    const enCobro = vista === 'cobrando';
    panelDerecho = (
      <PanelCarrito
        key="pedido"
        carrito={carrito}
        layout={layout}
        despachar={despachar}
        onCobrar={enCobro ? () => confirmacionCobro?.confirmar() : cobrar}
        expandido={panelExpandido}
        onExpandir={setPanelExpandido}
        textoAccion={enCobro && confirmacionCobro ? confirmacionCobro.textoBoton : undefined}
        deshabilitarAccion={enCobro && (!confirmacionCobro || !confirmacionCobro.puedeConfirmar)}
        cargandoAccion={enCobro && Boolean(confirmacionCobro?.registrando)}
      />
    );
  }

  return contenedor(
    <>
      <EncabezadoCaja
        layout={layout}
        acciones={<BarraAccionesCaja layout={layout} activo={accionActiva(vista)} onAccion={alAccion} />}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section
          aria-label={enCalculadora ? 'Calculadora' : enAutoconsumo ? 'Catálogo para autoconsumo' : 'Catálogo'}
          className={`flex min-w-0 flex-1 flex-col overflow-hidden${enAutoconsumo ? ' bg-lz-amber-light' : ''}`}
          style={esMovil ? { paddingBottom: MEDIDAS.barraMovil } : undefined}
        >
          {zonaIzquierda}
        </section>

        {panelDerecho}
      </div>

      {vista === 'ventas' && (
        <ListaVentasTurno
          turnoId={turno.id}
          personas={parametros.personas}
          onCambio={sinCambios}
          onTurnoCerrado={alTurnoCerrado}
          onCerrar={volverAVender}
        />
      )}

      {vista === 'gastos' && (
        <PanelGastos
          turnoId={turno.id}
          categorias={parametros.categoriasGasto.filter((c) => c.activo)}
          personas={parametros.personas}
          onCambio={sinCambios}
          onTurnoCerrado={alTurnoCerrado}
          onCerrar={volverAVender}
        />
      )}

      {vista === 'retiro' && (
        <DialogoRetiro
          turnoId={turno.id}
          personas={parametros.personas}
          onRegistrado={volverAVender}
          onTurnoCerrado={alTurnoCerrado}
          onCerrar={volverAVender}
        />
      )}

      {vista === 'cerrando' && (
        <CierreTurno
          turnoId={turno.id}
          personas={parametros.personas}
          baseDefecto={parametros.baseCajaDefecto}
          onCancelar={volverAVender}
          onCerrado={alCerrado}
          onYaCerrado={alYaCerrado}
          abrirCajon={abrirCajonTurno}
        />
      )}

      {enAutoconsumo && dialogoAutoconsumo && seleccion.length > 0 && (
        <DialogoAutoconsumo
          turnoId={turno.id}
          seleccion={seleccion}
          personas={parametros.personas}
          onRegistrado={alAutoconsumoRegistrado}
          onTurnoCerrado={alTurnoCerradoAvisado}
          onProductosCambiaron={alProductosAutoconsumoCambiaron}
          onCerrar={cerrarDialogoAutoconsumo}
        />
      )}

      {enAutoconsumo && listaAutoconsumos && (
        <ListaAutoconsumosTurno
          turnoId={turno.id}
          onTurnoCerrado={alTurnoCerradoAvisado}
          onCerrar={cerrarListaAutoconsumos}
        />
      )}

      <ConfirmacionVenta venta={confirmacion} onCerrar={() => setConfirmacion(null)} />
    </>
  );
}

export default PuntoVenta;
