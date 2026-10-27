import { buildCdxUrl, dedupeAdjacentDigests, parseCdx } from '../../src/core/cdx.ts';
import { sampleCaptures } from '../../src/core/sampling.ts';
import type { Capture } from '../../src/core/types.ts';
import { validateTargetUrl } from '../../src/core/url.ts';
import { CDX_TTL_S, cached, cdxKey } from '../cache.ts';
import type { Env, Io } from '../env.ts';
import { apiError, json } from '../http.ts';
import { fetchUpstream } from '../limits.ts';

/** Default and hard maximum number of sampled captures. */
export const DEFAULT_MAX = 16;
export const HARD_MAX = 24;

/** `GET /api/captures?url=&max=`: the URL's deduplicated CDX listing (cached 24 h), sampled to `max`. */
export async function captures(req: Request, url: URL, env: Env, io: Io): Promise<Response> {
  const check = validateTargetUrl(url.searchParams.get('url') ?? '');
  if (!check.ok) return apiError('invalid_url', check.message);
  const max = Math.min(HARD_MAX, Math.max(2, Math.floor(Number(url.searchParams.get('max')) || DEFAULT_MAX)));
  const all = await cached<Capture[]>(env.CACHE, await cdxKey(check.url), CDX_TTL_S, async () => {
    const res = await fetchUpstream(req, env, io, buildCdxUrl('internet-archive', check.url));
    if (res instanceof Response) return res;
    try {
      return dedupeAdjacentDigests(parseCdx('internet-archive', res.text));
    } catch {
      return apiError('archive_unavailable', 'The Internet Archive sent a capture list we could not read. Try again later.');
    }
  });
  if (all instanceof Response) return all;
  if (!all.length) return apiError('no_captures', 'The Internet Archive has no captures of this page yet.');
  const body = { url: check.url, totalCaptures: all.length, firstTs: all[0]!.ts, lastTs: all.at(-1)!.ts, captures: sampleCaptures(all, max) };
  return json(body, 200, 'public, max-age=3600');
}
