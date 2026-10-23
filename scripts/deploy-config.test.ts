// Guards the deploy setup (PLAN phase 20): the dry-run script, the production-only wrangler.jsonc (no named
// environments, custom domain, previews without production KV), the local config without AI (D11), the static
// headers (PLAN 5.4) and the build metadata kept out of the upload.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
/** wrangler.jsonc uses whole-line `//` comments only. */
const jsonc = (rel: string) => JSON.parse(read(rel).replace(/^\s*\/\/.*$/gm, ''));
const wrangler = jsonc('wrangler.jsonc');
const local = jsonc('wrangler.local.jsonc');
const PLACEHOLDER = '0'.repeat(32);
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
  it('check:deploy is exactly the dry run, and deploy is the Workers Builds pair (build, then a bare deploy)', () => {
    expect(pkg.scripts['check:deploy']).toBe('wrangler deploy --dry-run --outdir .wrangler/dry-run');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.deploy).toBe('pnpm build && wrangler deploy');
  });

  it('is production only: no named environments (no warning on a bare `wrangler deploy`), AI, the custom domain', () => {
    expect(wrangler).toMatchObject({ name: 'pagelapse', workers_dev: true, preview_urls: false, observability: { enabled: true } });
    expect(wrangler.env).toBeUndefined();
    expect(wrangler.ai).toEqual({ binding: 'AI' });
    expect(wrangler.routes).toEqual([{ pattern: 'pagelapse.geekplux.com', custom_domain: true }]);
    expect(wrangler.kv_namespaces.map((k: { binding: string }) => k.binding)).toEqual(['CACHE']);
  });

  it('binds CACHE to the real KV namespace id (32 hex, not the all-zeros placeholder)', () => {
    const id = wrangler.kv_namespaces[0].id as string;
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toBe(PLACEHOLDER);
  });

  it('gives Workers Builds previews their own rate limiters, but no production KV and no AI', () => {
    const { previews } = wrangler;
    expect(previews.ratelimits.map((r: { name: string }) => r.name)).toEqual(['UPSTREAM_LIMIT', 'AI_LIMIT']);
    const prodIds = wrangler.ratelimits.map((r: { namespace_id: string }) => r.namespace_id);
    for (const r of previews.ratelimits) expect(prodIds).not.toContain(r.namespace_id);
    expect(previews.kv_namespaces).toBeUndefined();
    expect(previews.ai).toBeUndefined();
  });

  it('wrangler.local.jsonc mirrors the production Worker for `pnpm dev`, without AI or the custom domain', () => {
    for (const key of ['name', 'main', 'compatibility_date', 'assets', 'ratelimits']) expect(local[key]).toEqual(wrangler[key]);
    expect(local.ai).toBeUndefined();
    expect(local.routes).toBeUndefined();
    expect(local.env).toBeUndefined();
    expect(local.kv_namespaces.map((k: { binding: string }) => k.binding)).toEqual(['CACHE']);
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
