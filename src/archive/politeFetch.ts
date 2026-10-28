/** App version sent in the User-Agent; a unit test keeps it equal to package.json. */
export const APP_VERSION = '0.1.0';
/** Identifies us to archives on every upstream request. */
export const USER_AGENT = `pagelapse/${APP_VERSION} (+https://github.com/geekplux/pagelapse)`;

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRY_AFTER_S = 30;

/** Non-retryable or exhausted HTTP failure. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** The archive asked us to wait longer than we are willing to (or kept rate-limiting); `retryAfter` is in seconds. */
export class RateLimitedError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super(`rate limited; retry after ${retryAfter} s`);
    this.name = 'RateLimitedError';
    this.retryAfter = retryAfter;
  }
}

/** Injectable IO and limits for {@link politeFetch}. */
export interface PoliteFetchOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  userAgent?: string;
  /** Total attempts including the first (default 3). */
  maxAttempts?: number;
  /** Body bytes kept; the stream is cancelled beyond this (default 2 MB). */
  maxBytes?: number;
  /** Per-attempt timeout (default 20 s). */
  timeoutMs?: number;
  /** Retry a 429 (default true). The Worker passes false: a 429 starts its global cooldown instead. */
  retry429?: boolean;
  /** Told about every failed attempt (an HTTP error or a network error), before any retry or throw. */
  onFailure?: (failure: UpstreamFailure) => void;
}

/** One failed attempt: the status (or "network"), the raw `Retry-After` header, and the attempt number. */
export interface UpstreamFailure {
  status: number | 'network';
  retryAfter: string | null;
  attempt: number;
}

/** A decoded upstream response. */
export interface PoliteResponse {
  url: string;
  status: number;
  text: string;
  /** True when the body was cut at `maxBytes`. */
  truncated: boolean;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Seconds from a `Retry-After` header (delta-seconds or HTTP date), or null. */
function retryAfterSeconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const s = /^\d+$/.test(value.trim()) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(s) ? Math.max(0, Math.ceil(s)) : null;
}

/** Decodes bytes using the header charset, else a `<meta charset>` in the first 1 KB, else UTF-8. */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  const label = /charset=["']?([\w.:-]+)/i.exec(contentType ?? '')?.[1] ?? /<meta[^>]+charset=["']?([\w.:-]+)/i.exec(head)?.[1];
  try {
    return new TextDecoder(label ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export async function readCapped(res: Pick<Response, 'body'>, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  const reader = res.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    // Strictly greater: a body ending exactly at maxBytes on a chunk boundary is complete.
    if (size > maxBytes) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  const bytes = new Uint8Array(size);
  chunks.reduce((at, c) => (bytes.set(c, at), at + c.length), 0);
  return { bytes: bytes.subarray(0, maxBytes), truncated };
}

/**
 * GET with manners: identified User-Agent, retries only on 429/502/503/504 and
 * network errors with 1/2/4 s (±20%) backoff, honours `Retry-After` (as a floor) up to 30 s (longer throws
 * {@link RateLimitedError}), never retries other statuses, caps the body, decodes the charset.
 */
export async function politeFetch(url: string, opts: PoliteFetchOptions = {}): Promise<PoliteResponse> {
  const { fetch: doFetch = fetch, sleep = realSleep, random = Math.random, maxAttempts = 3 } = opts;
  const backoff = (attempt: number) => Math.round(1000 * 2 ** (attempt - 1) * (0.8 + 0.4 * random()));
  for (let attempt = 1; ; attempt++) {
    const last = attempt >= maxAttempts;
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { 'User-Agent': opts.userAgent ?? USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
    } catch (err) {
      opts.onFailure?.({ status: 'network', retryAfter: null, attempt });
      if (last) throw err;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) {
      const { bytes, truncated } = await readCapped(res, opts.maxBytes ?? 2_000_000);
      return { url: res.url || url, status: res.status, text: decodeBody(bytes, res.headers.get('content-type')), truncated };
    }
    await res.body?.cancel();
    opts.onFailure?.({ status: res.status, retryAfter: res.headers.get('retry-after'), attempt });
    if (!RETRY_STATUS.has(res.status)) throw new HttpError(res.status, url);
    const wait = retryAfterSeconds(res.headers.get('retry-after'));
    if (wait !== null && wait > MAX_RETRY_AFTER_S) throw new RateLimitedError(wait);
    if (res.status === 429 && opts.retry429 === false) throw new RateLimitedError(wait ?? 60);
    if (last) throw res.status === 429 ? new RateLimitedError(wait ?? MAX_RETRY_AFTER_S) : new HttpError(res.status, url);
    // Never sooner than the backoff, even on `Retry-After: 0`; a longer `Retry-After` wins.
    await sleep(Math.max((wait ?? 0) * 1000, backoff(attempt)));
  }
}

/** Maps `items` through `fn` with at most `limit` calls in flight; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
