/**
 * Fuentes de la marca LIZPAN (diseño de Stitch).
 *
 * Solo deben importarlo los layouts de segmento de `/caja` y `/admin/reportes`,
 * nunca `src/app/layout.tsx`. Así Next.js incluye el CSS de estas fuentes solo
 * en esas rutas y `/login` y `/` se ven igual que antes (Req 16.5).
 *
 * `display: 'swap'` y la lista `fallback` hacen que el texto se muestre con una
 * fuente del sistema si la fuente de Stitch no carga (Req 16.6).
 */
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';

export const fuenteLzSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-lz-sans',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
});

export const fuenteLzDisplay = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-lz-display',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
});

/** Clases que definen las variables CSS `--font-lz-sans` y `--font-lz-display`. */
export const clasesFuentesLz = `${fuenteLzSans.variable} ${fuenteLzDisplay.variable}`;
