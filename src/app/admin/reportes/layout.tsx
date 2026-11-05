import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { clasesFuentesLz } from '@/lib/marca/fuentes';

/**
 * Layout del segmento `/admin/reportes`. Carga las fuentes y el tema `lz` solo
 * en esta ruta, sin tocar `src/app/layout.tsx` ni `globals.css` (Req 16.5).
 * La protección de sesión la sigue haciendo `AuthProvider`.
 */
export const metadata: Metadata = {
  title: 'Reportes | LIZPAN',
};

export default function ReportesLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${clasesFuentesLz} font-lz-sans bg-lz-linen text-lz-charcoal antialiased min-h-screen`}
    >
      {children}
    </div>
  );
}
