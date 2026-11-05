'use client';

// Protege el Modulo_Reportes con el PIN_Admin opcional (Req 15.1–15.3, 15.5–15.8).
// Guarda solo el conteo de intentos (localStorage) y la hora de verificación (sessionStorage), nunca el PIN.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { pinConfigurado, verificarPin } from '@/lib/api/pin';
import {
  PIN,
  accesoVigente,
  estaBloqueado,
  registrarExito,
  registrarFallo,
  type EstadoIntentos,
} from '@/lib/seguridad/pin';
import { LogoLizpan } from '@/components/marca/LogoLizpan';

const CLAVE_INTENTOS = 'lz_pin_intentos';
const CLAVE_OK = 'lz_pin_ok';

// ---------- Almacenamiento ----------

function leerIntentos(): EstadoIntentos {
  try {
    const crudo = localStorage.getItem(CLAVE_INTENTOS);
    if (!crudo) return { fallidos: 0, bloqueadoHasta: null };
    const v = JSON.parse(crudo) as Partial<EstadoIntentos>;
    const fallidos = typeof v.fallidos === 'number' && Number.isFinite(v.fallidos) ? v.fallidos : 0;
    const bloqueadoHasta =
      typeof v.bloqueadoHasta === 'number' && Number.isFinite(v.bloqueadoHasta) ? v.bloqueadoHasta : null;
    return { fallidos, bloqueadoHasta };
  } catch {
    return { fallidos: 0, bloqueadoHasta: null };
  }
}

function guardarIntentos(e: EstadoIntentos): void {
  try {
    localStorage.setItem(CLAVE_INTENTOS, JSON.stringify(e));
  } catch {
    // Sin almacenamiento disponible: el conteo vive solo en memoria.
  }
}

function leerVerificadoEn(): number | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_OK);
    if (crudo === null) return null;
    const n = Number(crudo);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function guardarVerificadoEn(ms: number | null): void {
  try {
    if (ms === null) sessionStorage.removeItem(CLAVE_OK);
    else sessionStorage.setItem(CLAVE_OK, String(ms));
  } catch {
    // Ignorado: sin marca, se vuelve a pedir el PIN.
  }
}

// ---------- Contexto ----------

interface GuardaPinContexto {
  /** Revisa que el acceso siga vigente antes de una consulta. Si venció, vuelve a pedir el PIN y devuelve `false` (Req 15.2). */
  revisarAcceso: () => boolean;
  /**
   * Vuelve a consultar si hay PIN configurado (p. ej. después de crearlo, cambiarlo o quitarlo).
   * Con `marcarVerificado` se registra la verificación ahora, porque quien cambió el PIN acaba de demostrar que lo conoce.
   */
  refrescarPin: (opciones?: { marcarVerificado?: boolean }) => Promise<void>;
  /** Borra la verificación y vuelve a pedir el PIN (si hay PIN configurado). */
  bloquear: () => void;
  /** `true` si hay PIN_Admin configurado. */
  hayPin: boolean;
}

const Contexto = createContext<GuardaPinContexto | null>(null);

export function useGuardaPin(): GuardaPinContexto {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useGuardaPin debe usarse dentro de <GuardaPin>');
  return ctx;
}

// ---------- Componente ----------

type Fase = 'cargando' | 'error' | 'abierto' | 'pedirPin';

interface GuardaPinProps {
  children: ReactNode;
}

function formatearRestante(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${String(seg).padStart(2, '0')}`;
}

export function GuardaPin({ children }: GuardaPinProps) {
  const [fase, setFase] = useState<Fase>('cargando');
  const [hayPin, setHayPin] = useState(false);
  const hayPinRef = useRef(false);
  const [reintentando, setReintentando] = useState(false);

  const fijarHayPin = useCallback((v: boolean) => {
    hayPinRef.current = v;
    setHayPin(v);
  }, []);

  /** Decide la fase según si hay PIN y si la verificación sigue vigente. */
  const decidirFase = useCallback((conPin: boolean) => {
    if (!conPin) {
      setFase('abierto');
      return;
    }
    setFase(accesoVigente(leerVerificadoEn(), Date.now()) ? 'abierto' : 'pedirPin');
  }, []);

  const cargar = useCallback(async () => {
    setReintentando(true);
    try {
      const conPin = await pinConfigurado();
      fijarHayPin(conPin);
      decidirFase(conPin);
    } catch {
      setFase('error');
    } finally {
      setReintentando(false);
    }
  }, [decidirFase, fijarHayPin]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const bloquear = useCallback(() => {
    guardarVerificadoEn(null);
    setFase(hayPinRef.current ? 'pedirPin' : 'abierto');
  }, []);

  const revisarAcceso = useCallback((): boolean => {
    if (!hayPinRef.current) return true;
    if (accesoVigente(leerVerificadoEn(), Date.now())) return true;
    guardarVerificadoEn(null);
    setFase('pedirPin');
    return false;
  }, []);

  const refrescarPin = useCallback(
    async (opciones?: { marcarVerificado?: boolean }) => {
      // Consulta silenciosa: no desmonta el contenido mientras responde. Si falla, conserva el estado actual.
      const conPin = await pinConfigurado();
      if (opciones?.marcarVerificado && conPin) {
        guardarVerificadoEn(Date.now());
        guardarIntentos(registrarExito());
      }
      fijarHayPin(conPin);
      decidirFase(conPin);
    },
    [decidirFase, fijarHayPin],
  );

  const alVerificar = useCallback(() => {
    guardarVerificadoEn(Date.now());
    guardarIntentos(registrarExito());
    setFase('abierto');
  }, []);

  const valor = useMemo<GuardaPinContexto>(
    () => ({ revisarAcceso, refrescarPin, bloquear, hayPin }),
    [revisarAcceso, refrescarPin, bloquear, hayPin],
  );

  if (fase === 'cargando') {
    return (
      <Pantalla>
        <p role="status" className="text-base text-lz-charcoal-muted">
          Cargando…
        </p>
      </Pantalla>
    );
  }

  if (fase === 'error') {
    return (
      <Pantalla>
        <div
          role="alert"
          className="flex w-full flex-col items-center gap-3 rounded-2xl border border-lz-danger-border bg-lz-danger-surface px-4 py-4 text-center"
        >
          <p className="font-lz-display text-base font-bold text-lz-danger">No se pudo cargar Reportes</p>
          <p className="text-sm text-lz-charcoal">Revise el internet y vuelva a intentar.</p>
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={reintentando}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-lz-sage px-4 text-sm font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
          >
            {reintentando ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      </Pantalla>
    );
  }

  if (fase === 'pedirPin') {
    // Req 15.1: solo el campo de PIN, ninguna sección ni cifra.
    return <FormularioPin onVerificado={alVerificar} />;
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

// ---------- Piezas internas ----------

function Pantalla({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-lz-linen px-4 py-8 font-lz-sans">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-lz-border bg-lz-surface p-6 shadow-lz-card">
        <LogoLizpan alto={112} />
        {children}
      </div>
    </main>
  );
}

function FormularioPin({ onVerificado }: { onVerificado: () => void }) {
  const [pin, setPin] = useState('');
  const [intentos, setIntentos] = useState<EstadoIntentos>(() => leerIntentos());
  const [ahora, setAhora] = useState(() => Date.now());
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);

  const { bloqueado, restanteMs } = estaBloqueado(intentos, ahora);

  // Cuenta regresiva del bloqueo; al terminar, el conteo vuelve a 0 (Req 15.3).
  useEffect(() => {
    if (!bloqueado) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setAhora(t);
      const r = estaBloqueado(leerIntentos(), t);
      if (!r.bloqueado) {
        guardarIntentos(r.estado);
        setIntentos(r.estado);
        setMensaje(null);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [bloqueado]);

  useEffect(() => {
    if (!bloqueado && !verificando) campoRef.current?.focus();
  }, [bloqueado, verificando]);

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (verificando || pin.length === 0) return;

    const t0 = Date.now();
    const actual = estaBloqueado(leerIntentos(), t0);
    setAhora(t0);
    setIntentos(actual.estado);
    if (actual.bloqueado) return;

    setVerificando(true);
    setMensaje(null);
    try {
      const correcto = await verificarPin(pin);
      if (correcto) {
        setPin('');
        onVerificado();
        return;
      }
      const t = Date.now();
      const nuevo = registrarFallo(leerIntentos(), t);
      guardarIntentos(nuevo);
      setIntentos(nuevo);
      setAhora(t);
      setPin('');
      const quedan = PIN.intentos - nuevo.fallidos;
      setMensaje(
        nuevo.bloqueadoHasta !== null
          ? null
          : `PIN incorrecto. ${quedan === 1 ? 'Queda 1 intento' : `Quedan ${quedan} intentos`}.`,
      );
    } catch {
      // Req 15.8: error o 10 s sin respuesta no cuenta como intento fallido.
      setMensaje('No se pudo verificar el PIN. Revise el internet y vuelva a intentar.');
    } finally {
      setVerificando(false);
    }
  };

  return (
    <Pantalla>
      <form onSubmit={enviar} className="flex w-full flex-col gap-4" noValidate>
        <label htmlFor="lz-pin-admin" className="text-center font-lz-display text-lg font-bold text-lz-charcoal">
          Ingrese el PIN de administrador
        </label>
        <input
          ref={campoRef}
          id="lz-pin-admin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          disabled={bloqueado || verificando}
          aria-invalid={mensaje !== null}
          aria-describedby="lz-pin-mensaje"
          className="min-h-[44px] w-full rounded-xl border border-lz-border bg-lz-surface px-4 text-center text-2xl tracking-[0.5em] text-lz-charcoal focus:border-lz-sage focus:outline-none focus:ring-2 focus:ring-lz-sage-tint disabled:bg-lz-oat"
        />
        <div id="lz-pin-mensaje" aria-live="polite" className="min-h-[1.5rem] text-center text-sm">
          {bloqueado ? (
            <p role="alert" className="text-lz-danger">
              Demasiados intentos. Intente de nuevo en {formatearRestante(restanteMs)}.
            </p>
          ) : mensaje ? (
            <p role="alert" className="text-lz-danger">
              {mensaje}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={bloqueado || verificando || pin.length === 0}
          className="min-h-[44px] w-full rounded-xl bg-lz-sage px-4 text-base font-semibold text-lz-surface transition-colors hover:bg-lz-sage-dark disabled:opacity-50"
        >
          {verificando ? 'Verificando…' : 'Entrar'}
        </button>
      </form>
    </Pantalla>
  );
}

export default GuardaPin;
