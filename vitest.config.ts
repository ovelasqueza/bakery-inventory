import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Configuración de pruebas (Vitest + fast-check).
// Entorno 'node' por defecto; las pruebas de componentes/hooks deben
// declarar `// @vitest-environment jsdom` al inicio del archivo.
export default defineConfig({
  // tsconfig usa `jsx: preserve` (lo exige Next); en pruebas se transforma JSX
  // con el runtime automático de React.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true,
  },
})
