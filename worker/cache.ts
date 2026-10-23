import { EXTRACTOR_VERSION } from '../src/core/extract.ts';

/** CDX listings are cached for a day: new captures appear daily at most (PLAN 5.7). */
export const CDX_TTL_S = 86_400;

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** KV key of a URL's CDX listing. */
export const cdxKey = async (url: string) => `cdx:v1:${await sha256(url)}`;
/** KV key of one extracted capture; captures are immutable, so bumping EXTRACTOR_VERSION is the only invalidation. */
export const snapKey = async (url: string, ts: string) => `snap:v1:e${EXTRACTOR_VERSION}:${await sha256(url)}:${ts}`;

/**
 * Returns the cached JSON value at `key`, or computes, stores (with `ttlS`, or forever) and returns it.
 * A computed `Response` is an error: it is returned as is and never cached.
 */
export async function cached<T>(kv: KVNamespace, key: string, ttlS: number | undefined, compute: () => Promise<T | Response>): Promise<T | Response> {
  const hit = await kv.get<T>(key, 'json');
  if (hit !== null) return hit;
  const value = await compute();
  if (!(value instanceof Response)) await kv.put(key, JSON.stringify(value), ttlS ? { expirationTtl: ttlS } : {});
  return value;
}

/** Keys kept by `memoryKv`: extracted captures are small, so this stays far below an isolate's 128 MB. */
export const MEMORY_MAX = 200;

/**
 * A stand-in for KV when the Worker has no `CACHE` binding (Workers Builds previews, D11): per isolate, at most
 * `max` keys (oldest dropped first), `expirationTtl` honoured. Only the `get`/`put` calls the Worker makes.
 */
export function memoryKv(max = MEMORY_MAX, now = () => Date.now()): KVNamespace {
  const store = new Map<string, { value: string; until: number }>();
  const get = async (key: string, type?: 'text' | 'json') => {
    const hit = store.get(key);
    if (!hit || hit.until <= now()) return (store.delete(key), null);
    return type === 'json' ? JSON.parse(hit.value) : hit.value;
  };
  const put = async (key: string, value: string, opts?: { expirationTtl?: number }) => {
    store.delete(key);
    store.set(key, { value, until: opts?.expirationTtl ? now() + opts.expirationTtl * 1000 : Infinity });
    while (store.size > max) store.delete(store.keys().next().value!);
  };
  return { get, put } as unknown as KVNamespace;
}
