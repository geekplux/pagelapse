// Size budgets (PLAN AC 30, 32 and 40). Run after `pnpm build`: prints a table and exits
// non-zero if any budget is exceeded or a non-allowed package reached a client chunk.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PICTURE_BUDGET, checkPictures } from './lib/pictures.ts';
import { recordedSamples } from './lib/sampleConfig.ts';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist', 'client');
/** Packages allowed in the browser bundle (scheduler is react-dom's own dependency). */
const CLIENT_PACKAGES = new Set(['react', 'react-dom', 'scheduler']);
const KB = 1000;

const gz = (buf: Buffer | string) => gzipSync(buf, { level: 9 }).length;
const read = (rel: string) => readFileSync(join(dist, rel.replace(/^\//, '')));

const manifestFile = join(dist, '.vite', 'chunk-modules.json');
if (!existsSync(manifestFile)) {
  console.error('check-size: dist/client/.vite/chunk-modules.json missing: run `pnpm build` first');
  process.exit(1);
}
const chunks = JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<string, string[]>;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const hrefs = (re: RegExp) => [...html.matchAll(re)].map((m) => m[1]!);
const initialJs = [
  ...hrefs(/<script[^>]*\ssrc="([^"]+)"/g),
  ...hrefs(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g),
];
const cssFiles = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.css'));
const fontDir = join(dist, 'fonts');
const fonts = existsSync(fontDir) ? readdirSync(fontDir).filter((f) => f.endsWith('.woff2')) : [];
// The default sample is the first recorded entry of samples.config.json (src/samples/index.ts, registry order).
const defaultId = recordedSamples(root)[0]!.id;
const sample = JSON.stringify(JSON.parse(readFileSync(join(root, `src/samples/${defaultId}.json`), 'utf8')));
const pictures = checkPictures(root);

const rows: [string, number, number][] = [
  // Includes public/theme.js, the blocking pre-paint script (a plain <script src>), which also has its own row.
  ['initial JS (gzip)', initialJs.reduce((n, f) => n + gz(read(f)), 0), 100 * KB],
  ['theme.js (gzip)', initialJs.includes('/theme.js') ? gz(read('/theme.js')) : Infinity, 1 * KB],
  ['CSS (gzip, all files)', cssFiles.reduce((n, f) => n + gz(read(`assets/${f}`)), 0), 15 * KB],
  // Schibsted Grotesk (variable, 400 to 700) and IBM Plex Mono 400 + 500, latin subsets: about 76 KB.
  [`fonts (${fonts.length} woff2)`, fonts.reduce((n, f) => n + read(`fonts/${f}`).length, 0), 80 * KB],
  ['default sample (gzip)', gz(sample), 40 * KB],
  [`pictures (${pictures.count} webp)`, pictures.total, PICTURE_BUDGET.total],
  ['largest full picture', pictures.largestFull, PICTURE_BUDGET.full],
  ['largest thumbnail', pictures.largestThumb, PICTURE_BUDGET.thumb],
  ['first-view pictures', pictures.firstView, PICTURE_BUDGET.firstView],
];

const problems: string[] = [
  ...(initialJs.length ? [] : ['no entry <script> found in dist/client/index.html']),
  ...(initialJs.includes('/theme.js') ? [] : ['no <script src="/theme.js"> in dist/client/index.html']),
  ...pictures.problems,
];
console.log(`${'budget'.padEnd(24)}${'actual'.padStart(11)}${'limit'.padStart(11)}  status`);
for (const [name, bytes, limit] of rows) {
  const ok = bytes <= limit;
  if (!ok) problems.push(`${name} is ${bytes} B, over ${limit} B`);
  console.log(`${name.padEnd(24)}${`${(bytes / KB).toFixed(1)} KB`.padStart(11)}${`${limit / KB} KB`.padStart(11)}  ${ok ? 'ok' : 'OVER'}`);
}

// AC 32: only react/react-dom in client chunks; htmlparser2 (Worker-only) must never leak in.
for (const [chunk, ids] of Object.entries(chunks)) {
  for (const id of ids) {
    const pkg = /.*node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id)?.[1];
    if (id.includes('htmlparser2')) problems.push(`htmlparser2 found in client chunk ${chunk}: ${id}`);
    else if (pkg && !CLIENT_PACKAGES.has(pkg)) problems.push(`non-allowed package "${pkg}" in client chunk ${chunk}`);
  }
}
console.log(`captures with a picture: ${Math.round(pictures.pictured * 100)}%`);
console.log(`client chunks: ${Object.keys(chunks).length}; packages: ${[...CLIENT_PACKAGES].join(', ')} allowed`);

if (problems.length) {
  console.error(`check-size: FAIL\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('check-size: all budgets met');
