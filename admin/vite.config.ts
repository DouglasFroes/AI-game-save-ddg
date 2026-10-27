import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Served by the API under /admin.
  base: '/admin/',
  server: { port: 5174, proxy: { '/api': { target: 'http://localhost:8080' } } },
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
