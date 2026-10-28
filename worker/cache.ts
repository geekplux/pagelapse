import { EXTRACTOR_VERSION } from '../src/core/extract.ts';

/** CDX listings are refreshed after a day (new captures appear daily at most), and kept for good after that. */
export const CDX_FRESH_S = 86_400;

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** KV key of a URL's CDX listing (v2: a {@link Kept} value, no expiry). */
export const cdxKey = async (url: string) => `cdx:v2:${await sha256(url)}`;
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

/** A value stored by {@link kept}, with the time it was fetched (epoch ms). */
export interface Kept<T> {
  at: number;
  value: T;
}

/**
 * Like {@link cached}, but the value never expires: once older than `freshS` it is computed again, and when that
 * fails (the archive refuses, times out, or the visitor is over their limit) the old value is served instead of the
 * error. Only an exclusion (403) wins over it. So a page looked up once keeps opening while the archive says no.
 */
export async function kept<T>(kv: KVNamespace, key: string, freshS: number, compute: () => Promise<T | Response>, now = Date.now): Promise<T | Response> {
  const hit = await kv.get<Kept<T>>(key, 'json');
  if (hit && now() - hit.at < freshS * 1000) return hit.value;
  const value = await compute();
  if (value instanceof Response) return hit && value.status !== 403 ? hit.value : value;
  await kv.put(key, JSON.stringify({ at: now(), value } satisfies Kept<T>));
  return value;
}

/** Keys kept by `memoryKv`: extracted captures are small, so this stays far below an isolate's 128 MB. */
export const MEMORY_MAX = 200;

/**
 * A stand-in for KV when the Worker has no `CACHE` binding (Workers Builds previews): per isolate, at most
 * `max` keys (oldest dropped first), `expirationTtl` honoured. Only the `get`/`put`/`list` calls the Worker makes.
 */
export function memoryKv(max = MEMORY_MAX, now = () => Date.now()): KVNamespace {
  const store = new Map<string, { value: string; until: number; metadata?: unknown }>();
  const get = async (key: string, type?: 'text' | 'json') => {
    const hit = store.get(key);
    if (!hit || hit.until <= now()) return (store.delete(key), null);
    return type === 'json' ? JSON.parse(hit.value) : hit.value;
  };
  const put = async (key: string, value: string, opts?: { expirationTtl?: number; metadata?: unknown }) => {
    store.delete(key);
    store.set(key, { value, until: opts?.expirationTtl ? now() + opts.expirationTtl * 1000 : Infinity, metadata: opts?.metadata });
    while (store.size > max) store.delete(store.keys().next().value!);
  };
  /** Live keys under `prefix` in name order, with their metadata, as KV lists them. */
  const list = async ({ prefix = '', limit = 1000 }: { prefix?: string; limit?: number } = {}) => {
    const keys = [...store].filter(([k, v]) => k.startsWith(prefix) && v.until > now()).map(([name, v]) => ({ name, metadata: v.metadata }));
    keys.sort((a, b) => (a.name < b.name ? -1 : 1));
    return { keys: keys.slice(0, limit), list_complete: keys.length <= limit, cacheStatus: null };
  };
  return { get, put, list } as unknown as KVNamespace;
}
