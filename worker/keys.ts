import { EXTRACTOR_VERSION } from '../src/core/extract.ts';

// KV keys and the sampling size, free of Workers types so scripts/prewarm.ts computes exactly what the Worker stores.

/** Default number of sampled captures (`GET /api/captures`, and what the app asks for). */
export const DEFAULT_MAX = 16;

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A value stored by `kept` (worker/cache.ts), with the time it was fetched (epoch ms). */
export interface Kept<T> {
  at: number;
  value: T;
}

/** The stored form of a {@link Kept} value. */
export const keptJson = <T>(value: T, at: number) => JSON.stringify({ at, value } satisfies Kept<T>);

/** KV key of a URL's CDX listing (v2: a {@link Kept} value, no expiry; worker/cache.ts). */
export const cdxKey = async (url: string) => `cdx:v2:${await sha256(url)}`;
/** KV key of one extracted capture; captures are immutable, so bumping EXTRACTOR_VERSION is the only invalidation. */
export const snapKey = async (url: string, ts: string) => `snap:v1:e${EXTRACTOR_VERSION}:${await sha256(url)}:${ts}`;
