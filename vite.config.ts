import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works on GitHub Pages or any sub-folder.
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      output: {
        // Phaser rarely changes: its own chunk stays cached across deploys of the games.
        codeSplitting: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
