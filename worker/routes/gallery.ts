import { sampleCaptures } from '../../src/core/sampling.ts';
import { buildTimeline } from '../../src/core/timeline.ts';
import { timestampToIso } from '../../src/core/timestamp.ts';
import type { Capture, ExtractedPage, SnapshotPage } from '../../src/core/types.ts';
import { validateTargetUrl } from '../../src/core/url.ts';
import { type Kept, cdxKey, sha256, snapKey } from '../cache.ts';
import type { Env, Io } from '../env.ts';
import { apiError, json, readTextCapped } from '../http.ts';
import { DEFAULT_MAX } from './captures.ts';

/** One shared page as "Recently explored" lists it. It is also its KV key's metadata, so a listing needs no reads. */
export interface GalleryEntry {
  url: string;
  /** The page title of its latest fetched capture, or "" when it had none. */
  title: string;
  /** Captures the page shows (the sampled ones), as a sample's card counts them. */
  captures: number;
  firstTs: string;
  lastTs: string;
  /** When it was shared (epoch ms). */
  added: number;
  /**
   * Each meaningful change, oldest first, as `[where, how much]`: where its After capture falls between `firstTs` and
   * `lastTs` (0 to 1000), and its significance score (0 to 100). The card draws them as dots along its years. Entries shared
   * before this field existed lack it until they are shared again.
   */
  changes?: [number, number][];
}

/** Entry keys sort newest first: `gallery:v1:<ms until year 2286, zero-padded>:<url hash>`. */
const ENTRY_PREFIX = 'gallery:v1:';
/** `gallery:url:<url hash>` points at a page's entry key, so sharing a page twice keeps one entry. */
const URL_PREFIX = 'gallery:url:';
/** A JSON array of hosts (`example.org`) or full addresses the maintainer removed (docs/DEPLOY.md). */
export const BLOCK_KEY = 'gallery:block';
/** Entries the home page's listing returns: three rows of four; more than these links to the full list. */
export const GALLERY_MAX = 12;
/** Entries per page of the full listing (`?all`). */
export const GALLERY_PAGE = 60;
const MAX_URL = 200;
const MAX_TITLE = 120;
/** Topics the gallery never lists: finance (CLAUDE.md) and obvious adult content. Matched on host and path. */
const DENY = /\b(?:crypto\w*|bitcoin|btc|ethereum|nft|forex|trading|stocks?|casino|betting|gambl\w*|porn\w*|xxx|nsfw|onlyfans)\b/i;

const newestFirst = (ms: number) => String(9_999_999_999_999 - ms).padStart(13, '0');
/** KV metadata holds at most 1024 bytes of JSON. */
const MAX_METADATA = 1000;

const msOf = (ts: string) => Date.parse(timestampToIso(ts));

/** The `changes` of a page: its cached sampled captures diffed in time order, as the live run would. */
export function changePoints(url: string, sampled: readonly Capture[], pages: readonly (Partial<ExtractedPage> | null)[], firstTs: string, lastTs: string): [number, number][] {
  const snaps: SnapshotPage[] = sampled.flatMap((c, i) => {
    const p = pages[i];
    return p && Array.isArray(p.blocks) ? [{ ts: c.ts, digest: c.digest, title: p.title ?? '', blocks: p.blocks }] : [];
  });
  const [a, b] = [msOf(firstTs), msOf(lastTs)];
  return buildTimeline(url, snaps).entries.map((e) => [
    Math.round(((msOf(e.to) - a) / Math.max(1, b - a)) * 1000),
    Math.round(e.significance.score * 100),
  ]);
}

/** Trims the title, then the changes, until the entry fits in KV metadata. */
export function fit(entry: GalleryEntry): GalleryEntry {
  const size = (e: GalleryEntry) => new TextEncoder().encode(JSON.stringify(e)).length;
  let e = entry;
  while (size(e) > MAX_METADATA && e.title.length > 20) e = { ...e, title: e.title.slice(0, -10) };
  while (size(e) > MAX_METADATA && e.changes?.length) e = { ...e, changes: e.changes.slice(0, -1) };
  return e;
}

async function blocked(env: Env): Promise<Set<string>> {
  const list = await env.CACHE.get<string[]>(BLOCK_KEY, 'json').catch(() => null);
  return new Set(Array.isArray(list) ? list : []);
}

const isBlocked = (url: string, block: Set<string>) => {
  const u = new URL(url);
  return block.has(url) || block.has(u.hostname) || block.has(u.hostname.replace(/^www\./, '')) || DENY.test(`${u.hostname} ${u.pathname}`);
};

/**
 * `GET /api/gallery`: the latest shared pages, newest first, and `more` when there are others (the home page links to
 * the full list). `GET /api/gallery?all[&cursor=]`: every shared page, a page of `GALLERY_PAGE` at a time, with the
 * `cursor` of the next page while there is one.
 */
export async function gallery(_req: Request, url: URL, env: Env): Promise<Response> {
  const all = url.searchParams.has('all');
  const cursor = url.searchParams.get('cursor') || undefined;
  const [list, block] = await Promise.all([
    env.CACHE.list<GalleryEntry>({ prefix: ENTRY_PREFIX, limit: all ? GALLERY_PAGE : GALLERY_MAX * 2, ...(all && cursor && { cursor }) }),
    blocked(env),
  ]);
  const shown = list.keys.flatMap((k) => (k.metadata && !isBlocked(k.metadata.url, block) ? [k.metadata] : []));
  if (all) return json({ entries: shown, ...(!list.list_complete && { cursor: list.cursor }) }, 200, 'public, max-age=300');
  return json({ entries: shown.slice(0, GALLERY_MAX), more: shown.length > GALLERY_MAX || !list.list_complete }, 200, 'public, max-age=300');
}

/**
 * `POST /api/gallery {url}`: lists a page in "Recently explored". Only a page someone has just looked up qualifies:
 * its capture list and at least half of its sampled captures must already be in KV, so an entry opens without the
 * archive. Addresses with a query or fragment (they can hold private tokens) and the blocked or denied ones are refused.
 * Sharing a listed page again keeps its place, and fills in its changes if it was shared before they were stored.
 */
export async function share(req: Request, _url: URL, env: Env, _io: Io): Promise<Response> {
  const raw = await readTextCapped(req, 1024);
  if (raw === null) return apiError('bad_request', 'The request body is too large.');
  let body: { url?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError('bad_request', 'The request body is not JSON.');
  }
  const check = validateTargetUrl(typeof body?.url === 'string' ? body.url : '');
  if (!check.ok) return apiError('invalid_url', check.message);
  const page = new URL(check.url);
  if (page.search || page.hash || check.url.length > MAX_URL) return apiError('bad_request', 'Only plain page addresses (no ? or #) can be shared.');
  if (isBlocked(check.url, await blocked(env))) return apiError('bad_request', 'This page cannot be listed in Recently explored.');
  const key = req.headers.get('cf-connecting-ip') ?? 'local';
  if (env.GALLERY_LIMIT && !(await env.GALLERY_LIMIT.limit({ key })).success) {
    return apiError('rate_limited', 'Too many pages shared from your connection. Try again in a minute.', 60);
  }
  const hash = await sha256(check.url);
  const listedKey = await env.CACHE.get(URL_PREFIX + hash);
  const listed = listedKey ? (await env.CACHE.getWithMetadata<GalleryEntry>(listedKey)).metadata : null;
  if (listed?.changes) return json({ shared: true }, 200);

  const listing = await env.CACHE.get<Kept<Capture[]>>(await cdxKey(check.url), 'json');
  const sampled = listing ? sampleCaptures(listing.value, DEFAULT_MAX) : [];
  const pages = await Promise.all(sampled.map(async (c) => env.CACHE.get<Partial<ExtractedPage>>(await snapKey(check.url, c.ts), 'json')));
  if (sampled.length < 2 || pages.filter(Boolean).length * 2 < sampled.length) {
    return apiError('bad_request', 'Look this page up first: only pages whose captures are already fetched can be shared.');
  }
  const all = listing!.value;
  const title = (pages.findLast((p) => p?.title)?.title ?? '').slice(0, MAX_TITLE);
  if (DENY.test(title)) return apiError('bad_request', 'This page cannot be listed in Recently explored.');
  const [firstTs, lastTs] = [all[0]!.ts, all.at(-1)!.ts];
  const entry = fit({
    url: check.url,
    title,
    captures: sampled.length,
    firstTs,
    lastTs,
    added: listed?.added ?? Date.now(),
    changes: changePoints(check.url, sampled, pages, firstTs, lastTs),
  });
  const entryKey = listedKey ?? `${ENTRY_PREFIX}${newestFirst(entry.added)}:${hash}`;
  await env.CACHE.put(entryKey, '', { metadata: entry });
  if (!listedKey) await env.CACHE.put(URL_PREFIX + hash, entryKey);
  return json({ shared: true }, 200);
}
