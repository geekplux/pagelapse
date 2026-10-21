import { HttpError, type PoliteResponse, RateLimitedError, politeFetch } from '../src/archive/politeFetch.ts';
import type { Env, Io } from './env.ts';
import { apiError } from './http.ts';

const COOLDOWN_KEY = 'ia:cooldown';
/** A 429 from the archive stops all uncached upstream requests for at least this long (AC 17). */
export const COOLDOWN_S = 60;

/** Seconds left in the global archive cooldown, or 0. The KV value is the end time in epoch ms. */
async function cooldownLeft(env: Env): Promise<number> {
  const until = Number(await env.CACHE.get(COOLDOWN_KEY));
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

/**
 * The only way the Worker reaches the archive. Checks the global cooldown, then the per-IP
 * `UPSTREAM_LIMIT`, then politeFetches (identified UA, backoff, 2 MB cap). A 429 is not retried:
 * it starts the cooldown. Failures come back as API error responses.
 */
export async function fetchUpstream(req: Request, env: Env, io: Io, url: string): Promise<PoliteResponse | Response> {
  const wait = await cooldownLeft(env);
  if (wait) return apiError('archive_rate_limited', 'The Internet Archive asked us to slow down. Try again shortly.', wait);
  const key = req.headers.get('cf-connecting-ip') ?? 'local';
  if (env.UPSTREAM_LIMIT && !(await env.UPSTREAM_LIMIT.limit({ key })).success) {
    return apiError('rate_limited', 'Too many new lookups from your connection. Try again in a minute.', 60);
  }
  try {
    return await politeFetch(url, { fetch: io.fetch, sleep: io.sleep, retry429: false });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      const s = Math.max(COOLDOWN_S, err.retryAfter);
      await env.CACHE.put(COOLDOWN_KEY, String(Date.now() + s * 1000), { expirationTtl: s });
      return apiError('archive_rate_limited', 'The Internet Archive asked us to slow down. Try again shortly.', s);
    }
    if (err instanceof HttpError && err.status === 403) return apiError('excluded', 'This site is excluded from the Internet Archive.');
    if (err instanceof HttpError && err.status === 404) return apiError('not_found', 'The archive has no such capture.');
    return apiError('archive_unavailable', 'The Internet Archive is not responding right now. Try again later.');
  }
}
