// Renders assets/social-preview.svg to assets/social-preview.png (1280×640, the size GitHub's social preview wants),
// and copies it to public/social-preview.png (the site's og:image, index.html),
// in system Chrome. The SVG's relative pictures and fonts are inlined as data: URLs first, so nothing loads from the
// network. Run it under the shared browser lock: `flock /workspace/gx-projects/logs/browser.lock pnpm render:social`.
//
// Usage: pnpm render:social [--webp docs/screenshots/phase-19/social-preview.webp]
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium } from 'playwright-core';
import { encodeWebp } from './lib/webp.ts';

const root = resolve(import.meta.dirname, '..');
const SVG = join(root, 'assets/social-preview.svg');
const PNG = join(root, 'assets/social-preview.png');
const OG_PNG = join(root, 'public/social-preview.png');
const SIZE = { width: 1280, height: 640 };
/** GitHub rejects social previews of 1 MB or more. */
const MAX_BYTES = 1_000_000;
const MIME: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };

const { values } = parseArgs({ args: process.argv.slice(2).filter((a) => a !== '--'), options: { webp: { type: 'string' } } });

/** The SVG with every relative `href="…"` / `url("…")` replaced by a data: URL of the file it names. */
function inlineAssets(svg: string, base: string): string {
  return svg.replace(/(href=|url\()"(\.\.?\/[^"]+)"/g, (_, lead: string, rel: string) => {
    const file = resolve(base, rel);
    const mime = MIME[extname(file)];
    if (!mime) throw new Error(`render-social: no MIME type for ${rel}`);
    return `${lead}"data:${mime};base64,${readFileSync(file).toString('base64')}"`;
  });
}

let browser: Browser | undefined;
let code = 1;
try {
  const svg = inlineAssets(readFileSync(SVG, 'utf8'), dirname(SVG));
  browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  // Nothing may load from the network: every asset is inlined.
  await page.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient')));
  await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => undefined)));
  });
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length);
  if (fonts < 2) throw new Error(`render-social: Schibsted Grotesk and IBM Plex Mono did not load (${fonts} faces)`);
  const png = await page.screenshot({ clip: { x: 0, y: 0, ...SIZE } });
  writeFileSync(PNG, png);
  writeFileSync(OG_PNG, png);
  const bytes = statSync(PNG).size;
  if (bytes >= MAX_BYTES) throw new Error(`render-social: ${PNG} is ${bytes} B, GitHub needs < ${MAX_BYTES} B`);
  console.log(`render-social: wrote assets/social-preview.png (${SIZE.width}×${SIZE.height}, ${bytes} B)`);
  if (values.webp) {
    writeFileSync(resolve(root, values.webp), await encodeWebp(page, png, { quality: 0.8 }));
    console.log(`render-social: wrote ${values.webp}`);
  }
  code = 0;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
} finally {
  await browser?.close().catch(() => undefined);
}
process.exit(code);
