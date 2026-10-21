import { relative } from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Records which modules went into each client chunk, for scripts/check-size.ts (AC 32). */
function chunkModules(): Plugin {
  return {
    name: 'wd-chunk-modules',
    apply: 'build',
    applyToEnvironment: (env) => env.name === 'client',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((c) =>
        c.type === 'chunk' ? [[c.fileName, c.moduleIds.map((id) => relative(process.cwd(), id))]] : [],
      );
      this.emitFile({ type: 'asset', fileName: '.vite/chunk-modules.json', source: JSON.stringify(Object.fromEntries(chunks), null, 2) });
    },
  };
}

export default defineConfig({
  // The Cloudflare plugin builds the Worker next to the client and runs `vite dev`/`preview` in workerd (D1).
  // Tests use a fake Env instead (D15), so Vitest skips it.
  plugins: [react(), chunkModules(), process.env.VITEST ? [] : cloudflare()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'worker/**/*.test.ts'],
    setupFiles: ['test/setup/no-network.ts'],
    // Let palette.test.ts read tokens.css?raw (Vitest blanks CSS by default).
    css: { include: [/tokens\.css/] },
    // Shared, RAM-tight machine: keep the worker pool small.
    maxWorkers: 2,
  },
});
