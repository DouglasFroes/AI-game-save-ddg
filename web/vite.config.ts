import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Lists every file under `dir` as a posix path relative to `root`. */
function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? listFiles(full, root)
      : [relative(root, full).split('\\').join('/')];
  });
}

/**
 * Writes `sw.js` into the build: the template plus the list of files to cache offline and a hash
 * of their contents. A deploy that changes any file changes the worker, which is how installed
 * PWAs find out there is an update.
 */
function pwaServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pwa-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = listFiles(outDir).filter(
        (file) => file !== 'sw.js' && file !== 'og-banner.png',
      );
      const hash = createHash('sha1');
      for (const file of files.sort()) hash.update(file).update(readFileSync(join(outDir, file)));
      const template = readFileSync(
        fileURLToPath(new URL('./src/platform/pwa/sw.template.js', import.meta.url)),
        'utf8',
      );
      const worker = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(files));
      writeFileSync(join(outDir, 'sw.js'), worker);
    },
  };
}

export default defineConfig({
  plugins: [pwaServiceWorker()],
  // Relative base so the build works on GitHub Pages or any sub-folder.
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // `npm run dev` talks to the API running locally (see ../api); in production the API serves the game.
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8080', ws: true } },
  },
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
