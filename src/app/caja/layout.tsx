import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { clasesFuentesLz } from '@/lib/marca/fuentes';

/**
 * Layout del segmento `/caja`. Carga las fuentes y el tema `lz` solo en esta
 * ruta, sin tocar `src/app/layout.tsx` ni `globals.css` (Req 16.5).
 * La protección de sesión la sigue haciendo `AuthProvider` (Req 1.1, 1.3).
 */
export const metadata: Metadata = {
  title: 'Caja | LIZPAN',
};

export default function CajaLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${clasesFuentesLz} font-lz-sans bg-lz-linen text-lz-charcoal antialiased`}
    >
      {children}
    </div>
  );
}
