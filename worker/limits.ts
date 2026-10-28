import { HttpError, type PoliteResponse, RateLimitedError, politeFetch } from '../src/archive/politeFetch.ts';
import type { Env, Io } from './env.ts';
import { apiError } from './http.ts';

const COOLDOWN_KEY = 'ia:cooldown';
/** A 429 from the archive stops all uncached upstream requests for at least this long. */
export const COOLDOWN_S = 60;
/** How long the cooldown key outlives the cooldown, so the first success after a run of 429s can say how long it took. */
export const STREAK_TTL_S = 86_400;
/** Per-attempt upstream timeout: with 3 attempts and backoff, a dead archive fails in ~40 s instead of ~60 s. */
export const UPSTREAM_TIMEOUT_MS = 12_000;

const SLOW_DOWN = 'The Internet Archive asked us to slow down. Try again shortly.';

/** What `ia:cooldown` holds: when the cooldown ends, and when the current run of 429s began (epoch ms). */
interface Cooldown {
  until: number;
  since?: number;
}

/** The stored cooldown, or null. Older deploys stored the end time as a bare number. */
async function readCooldown(env: Env): Promise<Cooldown | null> {
  const raw = await env.CACHE.get(COOLDOWN_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as number | Cooldown;
    return typeof v === 'number' ? { until: v } : v;
  } catch {
    return null;
  }
}

/**
 * One JSON line per archive event for Workers Logs, which indexes its fields. It never holds visitor IPs or
 * the looked-up URLs: `kind` says only whether the request was a CDX listing or a capture.
 */
function log(event: string, fields: Record<string, unknown>): void {
  console.warn(JSON.stringify({ event, ...fields }));
}

const seconds = (ms: number) => Math.ceil(ms / 1000);

/**
 * The only way the Worker reaches the archive. Checks the global cooldown, then the per-IP
 * `UPSTREAM_LIMIT`, then politeFetches (identified UA, backoff, 2 MB cap). A 429 is not retried:
 * it starts the cooldown. Failures come back as API error responses, and archive trouble is logged.
 */
export async function fetchUpstream(req: Request, env: Env, io: Io, url: string): Promise<PoliteResponse | Response> {
  const kind = url.includes('/cdx/') ? 'cdx' : 'capture';
  const cooldown = await readCooldown(env);
  const wait = cooldown && cooldown.until > Date.now() ? seconds(cooldown.until - Date.now()) : 0;
  if (wait) {
    log('archive_cooldown_hit', { kind, wait });
    return apiError('archive_rate_limited', SLOW_DOWN, wait);
  }
  const key = req.headers.get('cf-connecting-ip') ?? 'local';
  if (env.UPSTREAM_LIMIT && !(await env.UPSTREAM_LIMIT.limit({ key })).success) {
    return apiError('rate_limited', 'Too many new lookups from your connection. Try again in a minute.', 60);
  }
  let retryAfter: string | null = null;
  try {
    const res = await politeFetch(url, {
      fetch: io.fetch,
      sleep: io.sleep,
      retry429: false,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      onFailure: (f) => {
        retryAfter = f.retryAfter;
        log('archive_failure', { kind, ...f });
      },
    });
    if (cooldown?.since) {
      log('archive_recovered', { kind, after: seconds(Date.now() - cooldown.since) });
      await env.CACHE.put(COOLDOWN_KEY, JSON.stringify({ until: 0 }), { expirationTtl: COOLDOWN_S });
    }
    return res;
  } catch (err) {
    if (err instanceof RateLimitedError) {
      const s = Math.max(COOLDOWN_S, err.retryAfter);
      const since = cooldown?.since ?? Date.now();
      await env.CACHE.put(COOLDOWN_KEY, JSON.stringify({ until: Date.now() + s * 1000, since }), { expirationTtl: STREAK_TTL_S });
      // `retryAfter` null means the archive gave no hint and the cooldown is our default; `streak` is how long it has refused.
      log('archive_cooldown_start', { kind, cooldown: s, retryAfter, streak: seconds(Date.now() - since) });
      return apiError('archive_rate_limited', SLOW_DOWN, s);
    }
    if (err instanceof HttpError && err.status === 403) return apiError('excluded', 'This site is excluded from the Internet Archive.');
    if (err instanceof HttpError && err.status === 404) return apiError('not_found', 'The archive has no such capture.');
    return apiError('archive_unavailable', 'The Internet Archive is not responding right now. Try again later.');
  }
}
