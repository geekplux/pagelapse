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

/**
 * `vite build` reads wrangler.jsonc (production, what Workers Builds deploys). `vite dev` reads wrangler.local.jsonc
 * (no AI binding, so no Cloudflare login). `vite preview` serves the production build with remote bindings off, so it
 * needs no login either: the `AI` binding is present but unreachable, and summaries fall back to rules (D11).
 */
const workerConfig = (command: 'build' | 'serve', isPreview?: boolean) =>
  command === 'build' ? {} : isPreview ? { remoteBindings: false } : { configPath: './wrangler.local.jsonc' };

export default defineConfig(({ command, isPreview }) => ({
  // The Cloudflare plugin builds the Worker next to the client and runs `vite dev`/`preview` in workerd (D1).
  // Tests use a fake Env instead (D15), so Vitest skips it.
  plugins: [react(), chunkModules(), process.env.VITEST ? [] : cloudflare(workerConfig(command, isPreview))],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'worker/**/*.test.ts'],
    setupFiles: ['test/setup/no-network.ts'],
    // Let the design tests read src/design/*.css?raw (Vitest blanks CSS by default).
    css: { include: [/src\/design\/[a-z]+\.css/] },
    // Shared, RAM-tight machine: keep the worker pool small.
    maxWorkers: 2,
  },
}));
