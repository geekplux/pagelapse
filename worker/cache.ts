import { EXTRACTOR_VERSION } from '../src/core/extract.ts';

/** CDX listings are cached for a day: new captures appear daily at most (PLAN 5.7). */
export const CDX_TTL_S = 86_400;

async function sha256(text: string): Promise<string> {
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
