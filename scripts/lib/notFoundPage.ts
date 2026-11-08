import type { Plugin } from 'vite';

/** The 404 page's title: never the home page's, so an unknown path cannot pass for it. */
export const NOT_FOUND_TITLE = 'Page not found · Pagelapse';

const TITLE_RE = /<title>[^<]*<\/title>/;

/**
 * The 404 page from the built index.html: the same app shell (a mistyped link still opens the app), with its own
 * title, `noindex` and no canonical, so search engines neither index it nor fold it into the home page.
 */
export function notFoundHtml(html: string, title: string): string {
  if (!TITLE_RE.test(html)) throw new Error('index.html has no <title> to replace');
  return html
    .replace(TITLE_RE, `<meta name="robots" content="noindex" />\n    <title>${title}</title>`)
    .replace(/\s*<link rel="canonical"[^>]*>/, '');
}

/**
 * Writes 404.html next to index.html in the client build. Workers static assets answer any path that is not a file
 * with it, at status 404 (wrangler.jsonc `not_found_handling: "404-page"`). The app has one route, `/`, and keeps its
 * state in the query (src/app/urlState.ts); `/api/*` runs the Worker first and is unaffected.
 */
export function notFoundPage(title = NOT_FOUND_TITLE): Plugin {
  return {
    name: 'pl-not-found-page',
    apply: 'build',
    applyToEnvironment: (env) => env.name === 'client',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        if (index?.type !== 'asset') return;
        this.emitFile({ type: 'asset', fileName: '404.html', source: notFoundHtml(String(index.source), title) });
      },
    },
  };
}
