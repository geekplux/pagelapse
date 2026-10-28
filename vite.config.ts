import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Records which modules went into each client chunk, for scripts/check-size.ts. */
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

/** What the gallery card of a recorded sample shows, read from its fixture at build time. */
interface Card {
  captures: number;
  firstTs: string;
  lastTs: string;
  /** The picture file (no extension) of its latest pictured capture. */
  shot?: string;
}

function card(fixture: string): Card | undefined {
  if (!existsSync(fixture)) return undefined;
  const { snapshots } = JSON.parse(readFileSync(fixture, 'utf8')) as { snapshots: { ts: string; shot?: { file?: string; status: string } }[] };
  const shot = snapshots.findLast((s) => s.shot?.file && s.shot.status !== 'failed')?.shot?.file;
  return { captures: snapshots.length, firstTs: snapshots[0]!.ts, lastTs: snapshots.at(-1)!.ts, ...(shot && { shot }) };
}

/**
 * `virtual:sample-catalog`: the id, label and url of every samples.config.json entry, plus a recorded one's gallery
 * card, picked at build time, so the first load carries only what the hero, the gallery and the address menu show
 * (the recorders' filters and attributions, and the fixtures themselves, stay out).
 */
function sampleCatalog(): Plugin {
  const id = 'virtual:sample-catalog';
  const file = resolve(import.meta.dirname, 'src/samples/samples.config.json');
  return {
    name: 'pl-sample-catalog',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(loaded) {
      if (loaded !== `\0${id}`) return undefined;
      this.addWatchFile(file);
      const entries = (JSON.parse(readFileSync(file, 'utf8')) as { id: string; label: string; url: string }[]).map(({ id, label, url }) => {
        const fixture = resolve(import.meta.dirname, `src/samples/${id}.json`);
        if (existsSync(fixture)) this.addWatchFile(fixture);
        return { id, label, url, card: card(fixture) };
      });
      return `export default ${JSON.stringify(entries)};`;
    },
  };
}

/**
 * `vite build` reads wrangler.jsonc (production, what Workers Builds deploys). `vite dev` reads wrangler.local.jsonc
 * (no AI binding, so no Cloudflare login). `vite preview` serves the production build with remote bindings off, so it
 * needs no login either: the `AI` binding is present but unreachable, and summaries fall back to rules.
 */
const workerConfig = (command: 'build' | 'serve', isPreview?: boolean) =>
  command === 'build' ? {} : isPreview ? { remoteBindings: false } : { configPath: './wrangler.local.jsonc' };

export default defineConfig(({ command, isPreview }) => ({
  // The Cloudflare plugin builds the Worker next to the client and runs `vite dev`/`preview` in workerd.
  // Tests use a fake Env instead, so Vitest skips it.
  plugins: [react(), chunkModules(), sampleCatalog(), process.env.VITEST ? [] : cloudflare(workerConfig(command, isPreview))],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'worker/**/*.test.ts'],
    setupFiles: ['test/setup/no-network.ts'],
    // Let the design tests read src/design/*.css?raw (Vitest blanks CSS by default).
    css: { include: [/src\/design\/[a-z]+\.css/] },
    // Keep the worker pool small so the tests fit on modest machines.
    maxWorkers: 2,
    // No persistent transform cache: it kept import.meta.glob results (src/samples/index.ts) from before a new fixture
    // was added, so the registry missed it. The suite takes seconds without it.
    fsModuleCache: false,
  },
}));
