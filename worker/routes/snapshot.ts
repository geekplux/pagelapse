import { extractPage } from '../../src/core/extract.ts';
import { isValidTimestamp } from '../../src/core/timestamp.ts';
import type { ExtractedPage } from '../../src/core/types.ts';
import { rawCaptureUrl, validateTargetUrl } from '../../src/core/url.ts';
import { cached, snapKey } from '../cache.ts';
import type { Env, Io } from '../env.ts';
import { apiError, json } from '../http.ts';
import { fetchUpstream } from '../limits.ts';

/** What KV holds per capture: the extracted page (never raw HTML), or a remembered "too large". */
type Stored = (ExtractedPage & { ts: string }) | { error: 'too_large' };

/** `GET /api/snapshot?url=&ts=`: one capture's extracted text, cached forever (captures are immutable). */
export async function snapshot(req: Request, url: URL, env: Env, io: Io): Promise<Response> {
  const check = validateTargetUrl(url.searchParams.get('url') ?? '');
  if (!check.ok) return apiError('invalid_url', check.message);
  const ts = url.searchParams.get('ts') ?? '';
  if (!isValidTimestamp(ts)) return apiError('invalid_url', 'ts must be a 14-digit capture timestamp (YYYYMMDDhhmmss).');
  const page = await cached<Stored>(env.CACHE, await snapKey(check.url, ts), undefined, async () => {
    const res = await fetchUpstream(req, env, io, rawCaptureUrl('internet-archive', ts, check.url));
    if (res instanceof Response) return res;
    return res.truncated ? { error: 'too_large' } : { ts, ...extractPage(res.text) };
  });
  if (page instanceof Response) return page;
  if ('error' in page) return apiError('too_large', 'This capture is larger than 2 MB, so it was skipped.');
  return json(page, 200, 'public, max-age=31536000, immutable');
}
