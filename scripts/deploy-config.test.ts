// Guards the deploy setup (PLAN phase 20): the dry-run script, the production-only AI binding (D11), the static
// headers (PLAN 5.4) and the build metadata kept out of the upload.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
/** wrangler.jsonc uses whole-line `//` comments only. */
const wrangler = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

/** `_headers` as `{ path: { header: value } }`. */
function headers(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let path = '';
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) out[(path = line.trim())] = {};
    else {
      const i = line.indexOf(':');
      out[path]![line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

describe('deploy config', () => {
  it('check:deploy is exactly the dry run, and deploy builds for production', () => {
    expect(pkg.scripts['check:deploy']).toBe('wrangler deploy --dry-run --outdir .wrangler/dry-run');
    expect(pkg.scripts.deploy).toBe('CLOUDFLARE_ENV=production pnpm build && wrangler deploy');
  });

  it('keeps AI in production only, which repeats every binding under the same Worker name', () => {
    expect(wrangler).toMatchObject({ name: 'pagelapse', workers_dev: true, preview_urls: false, observability: { enabled: true } });
    expect(wrangler.ai).toBeUndefined();
    const prod = wrangler.env.production;
    expect(prod.name).toBe('pagelapse');
    expect(prod.ai).toEqual({ binding: 'AI' });
    expect(prod.kv_namespaces.map((k: { binding: string }) => k.binding)).toEqual(['CACHE']);
    expect(prod.ratelimits).toEqual(wrangler.ratelimits);
  });

  it('serves the PLAN 5.4 CSP, allowing frames from the Internet Archive only, and no COEP', () => {
    const h = headers(read('public/_headers'));
    const csp = h['/*']!['content-security-policy']!;
    const directives = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]));
    expect(directives).toMatchObject({
      'default-src': "'self'", 'script-src': "'self'", 'connect-src': "'self'", 'img-src': "'self' data:",
      'frame-src': 'https://web.archive.org', 'child-src': 'https://web.archive.org', 'object-src': "'none'", 'frame-ancestors': "'none'",
    });
    expect(h['/*']).toMatchObject({ 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' });
    expect(JSON.stringify(h).toLowerCase()).not.toContain('cross-origin-embedder-policy');
    for (const path of ['/assets/*', '/samples/*']) expect(h[path]!['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('keeps the build metadata (.vite/chunk-modules.json) out of the deployed assets', () => {
    expect(read('public/.assetsignore').split('\n')).toContain('.vite');
  });
});
