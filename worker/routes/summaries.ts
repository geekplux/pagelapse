import { toChangeRecord } from '../../src/core/changeRecord.ts';
import { diffPages } from '../../src/core/diff.ts';
import { scoreDiff } from '../../src/core/score.ts';
import { isValidTimestamp } from '../../src/core/timestamp.ts';
import type { ChangeRecord, ExtractedPage } from '../../src/core/types.ts';
import { pairKey, validateTargetUrl } from '../../src/core/url.ts';
import { snapKey } from '../cache.ts';
import type { Env } from '../env.ts';
import { apiError, json, readCapped } from '../http.ts';
import { MAX_BATCH } from '../prompt.ts';
import { summarise } from '../summarise.ts';

type Pair = { from: string; to: string };
/** Request body cap: a full batch of 8 pairs and a long URL fit well within it. */
export const MAX_BODY = 4096;
const isPair = (p: unknown): p is Pair => {
  const { from, to } = (p ?? {}) as Partial<Pair>;
  return typeof from === 'string' && typeof to === 'string' && isValidTimestamp(from) && isValidTimestamp(to) && from < to;
};

/**
 * `POST /api/summaries` `{url, pairs: [{from, to}]}` (1-8 pairs) → `{summaries: [{pair, source, text?}]}`. The change
 * records are rebuilt here from the extracted captures in KV, never taken from the client, and nothing is fetched:
 * a pair whose captures are not cached, or whose change is trivial, comes back `source: "rule"` without text (the
 * browser keeps its own rule summary).
 */
export async function summaries(req: Request, _url: URL, env: Env): Promise<Response> {
  const raw = await readCapped(req, MAX_BODY);
  if (raw === null) return apiError('bad_request', `The request body is over ${MAX_BODY} bytes.`);
  let body: { url?: unknown; pairs?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const check = validateTargetUrl(typeof body?.url === 'string' ? body.url : '');
  const pairs = body?.pairs;
  if (!check.ok || !Array.isArray(pairs) || !pairs.length || pairs.length > MAX_BATCH || !pairs.every(isPair)) {
    return apiError('bad_request', `Send {url, pairs: [{from, to}]} with 1-${MAX_BATCH} capture pairs.`);
  }
  const load = async (ts: string) => {
    const page = await env.CACHE.get<ExtractedPage & { ts: string }>(await snapKey(check.url, ts), 'json');
    return page && 'blocks' in page ? { ...page, ts, digest: '' } : null;
  };
  const records: ChangeRecord[] = [];
  for (const { from, to } of pairs) {
    const [a, b] = await Promise.all([load(from), load(to)]);
    const diff = a && b && diffPages(a, b);
    if (a && b && diff && scoreDiff(diff, a, b).magnitude !== 'trivial') records.push(toChangeRecord(diff, a, b));
  }
  const done = await summarise(env, check.url, records, req.headers.get('cf-connecting-ip') ?? 'local');
  const byPair = new Map(done.map((s) => [s.pair, s]));
  return json({ summaries: pairs.map(({ from, to }) => byPair.get(pairKey(from, to)) ?? { pair: pairKey(from, to), source: 'rule' }) });
}
