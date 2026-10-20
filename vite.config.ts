import { relative } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Records which modules went into each client chunk, for scripts/check-size.ts (AC 32). */
function chunkModules(): Plugin {
  return {
    name: 'wd-chunk-modules',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((c) =>
        c.type === 'chunk' ? [[c.fileName, c.moduleIds.map((id) => relative(process.cwd(), id))]] : [],
      );
      this.emitFile({ type: 'asset', fileName: '.vite/chunk-modules.json', source: JSON.stringify(Object.fromEntries(chunks), null, 2) });
    },
  };
}

export default defineConfig({
  plugins: [react(), chunkModules()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Let palette.test.ts read tokens.css?raw (Vitest blanks CSS by default).
    css: { include: [/tokens\.css/] },
    // Shared, RAM-tight machine: keep the worker pool small.
    maxWorkers: 2,
  },
});
