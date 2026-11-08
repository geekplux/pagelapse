// The page an unknown path gets. Workers static assets answer any path that is not a file with dist/client/404.html at
// status 404 (`not_found_handling: "404-page"`), so a made-up URL no longer passes for a second copy of the home page
// (it used to get index.html with 200).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOT_FOUND_TITLE, notFoundHtml, notFoundPage } from './notFoundPage.ts';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const index = read('index.html');
const homeTitle = /<title>([^<]*)<\/title>/.exec(index)?.[1];

describe('404 page', () => {
  const page = notFoundHtml(index, NOT_FOUND_TITLE);

  it('has its own title, not the home page title', () => {
    expect(homeTitle).toMatch(/^Pagelapse: /);
    expect(page).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
    expect(page).not.toContain(`<title>${homeTitle}</title>`);
  });

  it('is noindex and names no canonical (the home page keeps its own)', () => {
    expect(index).toContain('<link rel="canonical" href="https://pagelapse.geekplux.com/" />');
    expect(page).toContain('<meta name="robots" content="noindex" />');
    expect(page).not.toContain('rel="canonical"');
  });

  it('keeps the rest of the shell (the app still opens on a mistyped link)', () => {
    expect(page).toContain('<div id="root">');
    expect(page).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it('refuses a shell without a title', () => {
    expect(() => notFoundHtml('<html><head></head></html>', NOT_FOUND_TITLE)).toThrow('no <title>');
  });

  it('is emitted as 404.html in the client build only', () => {
    const plugin = notFoundPage();
    const applies = plugin.applyToEnvironment as (env: { name: string }) => boolean;
    expect(applies({ name: 'client' })).toBe(true);
    expect(applies({ name: 'pagelapse' })).toBe(false);
    const emitted: { fileName: string; source: string }[] = [];
    const hook = plugin.generateBundle as { handler: (...args: unknown[]) => void };
    const ctx = { emitFile: (file: { fileName: string; source: string }) => emitted.push(file) };
    hook.handler.call(ctx, {}, {});
    expect(emitted).toEqual([]);
    hook.handler.call(ctx, {}, { 'index.html': { type: 'asset', source: index } });
    expect(emitted.map((file) => file.fileName)).toEqual(['404.html']);
    expect(emitted[0]!.source).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
  });

  it('is what wrangler.jsonc and wrangler.local.jsonc serve for an unknown path', () => {
    for (const config of ['wrangler.jsonc', 'wrangler.local.jsonc']) {
      expect(read(config)).toMatch(/"not_found_handling":\s*"404-page"/);
      expect(read(config)).not.toContain('single-page-application');
    }
  });
});
