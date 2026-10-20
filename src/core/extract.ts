// Server-side entry (Worker, recorder): imports htmlparser2, so it is deliberately not
// re-exported from ./index.ts and must never be imported by the browser app (D4, AC 32).
import { Parser } from 'htmlparser2';
import type { Block, BlockKind, ExtractedPage, HeadingLevel } from './types.ts';

/** Version of the extraction rules; bump it to invalidate cached extractions (PLAN 5.7). */
export const EXTRACTOR_VERSION = 2;

/** Size caps for {@link extractPage}; defaults are 400 blocks and 30,000 characters (AC 19). */
export interface ExtractOptions {
  maxBlocks?: number;
  maxChars?: number;
}

type El = { tag: string; children: (El | string)[] };
type Ctx = { kind: BlockKind; level?: HeadingLevel };

/** If the main-content selection has fewer words than this, the whole body is used. */
const MIN_MAIN_WORDS = 50;
/** Deeper elements are flattened into their ancestor, so traversals never overflow the stack. */
const MAX_DEPTH = 256;
/** htmlparser2's open-element stack costs O(n) per tag, so parsing stops beyond this many open tags. */
const MAX_OPEN = 4096;
const SKIP_TAGS = new Set(
  'script style noscript template svg iframe object canvas nav aside footer button select textarea label title'.split(' '),
);
const SKIP_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'search']);
// Wiki chrome that sits inside the content column ([edit] links, citation marks, navboxes, TOC).
const SKIP_CLASS = /(?:^|\s)(?:mw-editsection|mw-jump-link|mw-jump|vector-dropdown|noprint|navbox|catlinks|printfooter|reference|toc)(?:\s|$)/;
const SKIP_ID = /^(?:siteSub|contentSub|jump-to-nav)$/;
const BLOCK_TAGS = new Set(
  'address article blockquote body center dd details dir div dl dt fieldset figcaption figure form h1 h2 h3 h4 h5 h6 header hr html li main menu ol p pre section summary table tbody td tfoot th thead tr ul caption'.split(' '),
);
/** Elements that mark a table row as page layout rather than data. */
const LAYOUT_TAGS = new Set('table p div ul ol dl h1 h2 h3 h4 h5 h6 blockquote pre center hr br'.split(' '));
const TOOLBAR = /<!--\s*BEGIN WAYBACK TOOLBAR INSERT\s*-->[\s\S]*?(?:<!--\s*END WAYBACK TOOLBAR INSERT\s*-->|$)/gi;
const BR: El = { tag: 'br', children: [] };
const PARA: Ctx = { kind: 'paragraph' };
const LIST: Ctx = { kind: 'list-item' };
const CTX: Record<string, Ctx> = { li: LIST, dt: LIST, dd: LIST, blockquote: { kind: 'quote' }, pre: { kind: 'code' } };

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

function isBoilerplate(tag: string, a: Record<string, string>, inMain: boolean): boolean {
  return (
    SKIP_TAGS.has(tag) ||
    (tag === 'header' && !inMain) ||
    SKIP_ROLES.has(a.role ?? '') ||
    a.hidden !== undefined ||
    a['aria-hidden'] === 'true' ||
    /display:\s*none/i.test(a.style ?? '') ||
    SKIP_CLASS.test(a.class ?? '') ||
    SKIP_ID.test(a.id ?? '')
  );
}

function hasLayout(el: El): boolean {
  return el.children.some((c) => typeof c !== 'string' && (LAYOUT_TAGS.has(c.tag) || hasLayout(c)));
}

const inlineText = (n: El | string): string =>
  typeof n === 'string' ? n : n.tag === 'br' ? ' ' : n.children.map(inlineText).join('');

/** Turns element trees into blocks; `<br><br>` splits a block, a single `<br>` is a space. */
function collect(roots: El[]): Block[] {
  const out: Block[] = [];
  let buf = '';
  const flush = ({ kind, level }: Ctx) => {
    for (const part of buf.split(/\n(?: *\n)+/)) {
      const text = collapse(part);
      if (text) out.push(level ? { kind, text, level } : { kind, text });
    }
    buf = '';
  };
  const walk = (n: El | string, ctx: Ctx): void => {
    if (typeof n === 'string') {
      buf += n.replace(/\s+/g, ' ');
      return;
    }
    if (n.tag === 'br') {
      buf += '\n';
      return;
    }
    if (n.tag === 'tr' && !hasLayout(n)) {
      flush(ctx);
      const cells = n.children.flatMap((c) => (typeof c === 'string' ? [] : [collapse(inlineText(c))]));
      const text = cells.filter(Boolean).join(' | ');
      if (text) out.push({ kind: 'table-row', text });
      return;
    }
    const h = /^h([1-6])$/.exec(n.tag);
    let inner: Ctx | null = h ? { kind: 'heading', level: Number(h[1]) as HeadingLevel } : (CTX[n.tag] ?? null);
    if (n.tag === 'p') inner = ctx.kind === 'quote' || ctx.kind === 'list-item' ? ctx : PARA;
    if (!inner && BLOCK_TAGS.has(n.tag)) inner = ctx;
    if (!inner) {
      for (const c of n.children) walk(c, ctx);
      return;
    }
    flush(ctx);
    for (const c of n.children) walk(c, inner);
    flush(inner);
  };
  for (const r of roots) {
    walk(r, PARA);
    flush(PARA);
  }
  return out;
}

/**
 * Extracts the readable title and content blocks from raw archived HTML. Pure and
 * deterministic: drops scripts, navigation, footers, headers outside the main content,
 * hidden elements and Wayback toolbar remnants; prefers `<main>`/`[role=main]`, then
 * `<article>`, falling back to the whole body when that selection has < 50 words.
 * Pass already-decoded text (charset handling happens at fetch time).
 */
export function extractPage(html: string, opts: ExtractOptions = {}): ExtractedPage {
  const { maxBlocks = 400, maxChars = 30_000 } = opts;
  const root: El = { tag: 'body', children: [] };
  const mains: El[] = [];
  const articles: El[] = [];
  const stack: { tag: string; parent: El; skips: boolean; main: boolean; deep: boolean }[] = [];
  let cur = root;
  let depth = 0;
  let flattened = false;
  let skip = 0;
  let inMain = 0;
  let title: string | undefined;
  let inTitle = false;

  const parser = new Parser(
    {
      onopentag(tag, a) {
        if (tag === 'title' && title === undefined && !stack.some((f) => f.tag === 'svg')) {
          title = '';
          inTitle = true;
        }
        const skips = skip > 0 || isBoilerplate(tag, a, inMain > 0);
        const deep = !skips && depth >= MAX_DEPTH;
        const main = !skips && !deep && (tag === 'main' || tag === 'article' || a.role === 'main');
        stack.push({ tag, parent: cur, skips, main, deep });
        if (stack.length >= MAX_OPEN) {
          flattened = true;
          parser.pause();
        }
        if (skips) {
          skip++;
          return;
        }
        if (deep) {
          // Keep block boundaries as paragraph breaks (`<br><br>`) in the flattened text.
          if (BLOCK_TAGS.has(tag)) cur.children.push(BR, BR);
          flattened = true;
          return;
        }
        depth++;
        const el: El = { tag, children: [] };
        cur.children.push(el);
        if (main && !inMain) (tag === 'article' ? articles : mains).push(el);
        if (main) inMain++;
        cur = el;
      },
      ontext(text) {
        if (inTitle) title += text;
        else if (!skip) cur.children.push(text);
      },
      onclosetag(tag) {
        if (tag === 'title') inTitle = false;
        const f = stack.pop();
        if (!f) return;
        if (f.skips) skip--;
        else if (!f.deep) depth--;
        if (f.main) inMain--;
        cur = f.parent;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html.replace(TOOLBAR, ''));
  parser.end();

  const selected = mains.length ? mains : articles;
  let blocks = selected.length ? collect(selected) : [];
  if (blocks.reduce((n, b) => n + b.text.split(' ').length, 0) < MIN_MAIN_WORDS) blocks = collect([root]);

  const page: ExtractedPage = { title: collapse(title ?? ''), blocks: [] };
  if (flattened) page.truncated = true;
  let chars = 0;
  for (const b of blocks) {
    const room = maxChars - chars;
    if (page.blocks.length === maxBlocks || b.text.length > room) {
      page.truncated = true;
      const cut = page.blocks.length < maxBlocks ? b.text.slice(0, room).trim() : '';
      if (cut) page.blocks.push({ ...b, text: cut });
      break;
    }
    page.blocks.push(b);
    chars += b.text.length;
  }
  return page;
}
