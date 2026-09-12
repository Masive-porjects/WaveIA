import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // Mismo alias que tsconfig.json: "@/components/*" apunta a
      // presentation/components (convención del repo) y debe ir ANTES de
      // "@/", o el prefijo genérico se traga el import.
      {
        find: '@/components',
        replacement: fileURLToPath(
          new URL('./src/presentation/components', import.meta.url),
        ),
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
