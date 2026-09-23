'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button, Input, Card } from '@/components/ui';
import { login } from '@/lib/api/auth';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('Ingresa la contraseña');
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(password);

      if (result.success) {
        router.push('/');
      } else {
        setError(result.error || 'Contraseña incorrecta');
        setPassword('');
      }
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-bakery-50 to-orange-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-48 h-28 relative">
            <Image
              src="/logo-lizpan.png"
              alt="Logo LIZ PAN"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Card de login */}
        <Card className="p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-bakery-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-bakery-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Acceso al Sistema</h1>
            <p className="text-sm text-gray-500 mt-1">
              Ingresa la contraseña para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoFocus
                error={error}
              />
            </div>

            <Button
              type="submit"
              fullWidth
              isLoading={isLoading}
              disabled={isLoading}
            >
              {isLoading ? 'Verificando...' : 'Ingresar'}
            </Button>
          </form>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-gray-400 mt-6">
          Sistema de Inventario LIZPAN
        </p>
      </div>
    </div>
  );
}
