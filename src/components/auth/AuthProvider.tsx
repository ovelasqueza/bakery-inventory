'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated, logout as apiLogout, extendSession } from '@/lib/api/auth';
import { LoadingSpinner } from '@/components/ui';

interface AuthContextType {
  isLoggedIn: boolean;
  logout: () => void;
  checkAuth: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Rutas que no requieren autenticación
const PUBLIC_ROUTES = ['/login'];

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const pathname = usePathname();
  const router = useRouter();

  const checkAuth = useCallback(() => {
    const authenticated = isAuthenticated();
    setIsLoggedIn(authenticated);
    return authenticated;
  }, []);

  const handleLogout = useCallback(() => {
    apiLogout();
    setIsLoggedIn(false);
    router.push('/login');
  }, [router]);

  // Verificar autenticación al montar y cuando cambia la ruta
  useEffect(() => {
    const authenticated = checkAuth();
    setIsLoading(false);

    // Si está autenticado, extender la sesión con cada navegación
    if (authenticated) {
      extendSession();
    }
  }, [pathname, checkAuth]);

  // Redirigir según estado de autenticación
  useEffect(() => {
    if (isLoading) return;

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    if (!isLoggedIn && !isPublicRoute) {
      // No autenticado en ruta protegida -> ir a login
      router.push('/login');
    } else if (isLoggedIn && pathname === '/login') {
      // Autenticado en página de login -> ir a inicio
      router.push('/');
    }
  }, [isLoggedIn, isLoading, pathname, router]);

  // Mostrar loading mientras verificamos autenticación
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bakery-50 to-orange-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Si no está autenticado y no es ruta pública, mostrar loading (se está redirigiendo)
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  if (!isLoggedIn && !isPublicRoute) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bakery-50 to-orange-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn, logout: handleLogout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
