// Mock answers for the Worker API (`/api/captures`, `/api/snapshot`), generated from the committed samples, plus one
// error answer per failure the live UI handles. Used by the live smoke flows (scripts/smoke-live.ts) via page.route.
import { readFileSync } from 'node:fs';
import { fixtureToSnapshots, parseSampleFixture } from '../../../src/core/fixture.ts';
import type { SnapshotPage } from '../../../src/core/types.ts';
import { withEchoes } from '../echo.ts';

export interface MockApi {
  url: string;
  pages: SnapshotPage[];
  /** `GET /api/captures` body. */
  captures: { url: string; totalCaptures: number; firstTs: string; lastTs: string; captures: { ts: string; digest: string; length: number }[] };
  /** `GET /api/snapshot` body for capture `ts`. */
  snapshot: (ts: string) => { ts: string; title: string; blocks: SnapshotPage['blocks']; truncated?: boolean } | undefined;
}

/**
 * The API's answers for sample `id`, as if the Worker had fetched its captures from the Internet Archive. `same`: every
 * capture says what the first one said (a page where nothing meaningful changed). `echo`: the captures at these
 * indexes are each followed by a copy a minute later, a trivial edit (no built-in sample has one of its own).
 */
export function mockFromSample(id: string, opts: { same?: boolean; echo?: number[] } = {}): MockApi {
  const fixture = parseSampleFixture(JSON.parse(readFileSync(new URL(`../../../src/samples/${id}.json`, import.meta.url), 'utf8')));
  const all = withEchoes(fixtureToSnapshots(fixture), opts.echo ?? []);
  const pages = opts.same ? all.map((p) => ({ ...all[0]!, ts: p.ts, digest: p.digest })) : all;
  const caps = pages.map((p) => ({ ts: p.ts, digest: p.digest, length: 0 }));
  return {
    url: fixture.url,
    pages,
    captures: { url: fixture.url, totalCaptures: caps.length, firstTs: caps[0]!.ts, lastTs: caps.at(-1)!.ts, captures: caps },
    snapshot: (ts) => {
      const p = pages.find((x) => x.ts === ts);
      return p && { ts, title: p.title, blocks: p.blocks, ...(p.truncated && { truncated: true }) };
    },
  };
}

/** Error answers, as `worker/http.ts` `apiError` sends them. */
export const API_ERRORS = {
  no_captures: { status: 404, body: { error: 'no_captures', message: 'The Internet Archive has no captures of this page yet.' } },
  excluded: { status: 403, body: { error: 'excluded', message: 'This site is excluded from the Internet Archive.' } },
  archive_rate_limited: { status: 503, body: { error: 'archive_rate_limited', message: 'The Internet Archive asked us to slow down. Try again shortly.', retryAfter: 40 } },
  archive_unavailable: { status: 502, body: { error: 'archive_unavailable', message: 'The Internet Archive is not responding right now. Try again later.' } },
  rate_limited: { status: 429, body: { error: 'rate_limited', message: 'Too many new lookups from your connection. Try again in a minute.', retryAfter: 60 } },
} as const;

/** Mock Workers AI lines for the Creative Commons sample's meaningful changes, in timeline order (the smoke's AI flows). */
export const CC_AI_SUMMARIES = [
  'Replaced the shared-culture feature with a video library banner and new news items',
  'Redesigned the page around a slider and Mission, License and Explore boxes',
  'Replaced the "I Love to Share" slide with Vimeo adding CC browse and search',
  'Featured Wattpad adopting CC 4.0 and named Ryan Merkley as CEO',
  'Announced the 2015 Global Summit and added a "Find CC material" section',
  'Redesigned the page around "When we share, everyone wins"',
  'Announced the 2019 Global Summit in Lisbon',
  'Introduced the new CC Search and a leadership transition',
  'Marked twenty years of Creative Commons and trimmed the news',
  'Redesigned the page with "Better Sharing, Brighter Future" and a 20-year video',
  'Listed CC legal tools as digital public goods and added AI news',
  'Redesigned the page around "The commons belongs to us all"',
  'Retitled the page "Building tools for shared knowledge"',
];
