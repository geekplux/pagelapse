/**
 * Bindings from wrangler.jsonc, as the routes see them. Only `CACHE` is required, so local runs and tests work
 * without the rest; `AI` exists in production only and is read only by `summarise.ts`.
 */
export interface Env {
  CACHE: KVNamespace;
  UPSTREAM_LIMIT?: RateLimit;
  AI?: Ai;
  AI_LIMIT?: RateLimit;
  GALLERY_LIMIT?: RateLimit;
}

/**
 * What the runtime may pass in: Workers Builds previews have no `CACHE` binding (wrangler.jsonc `previews`), so
 * `handle` swaps in a per-isolate memory cache (`memoryKv` in cache.ts).
 */
export type Bindings = Omit<Env, 'CACHE'> & { CACHE?: KVNamespace };

/** Injectable IO, so tests run the real handlers with a recorded fake fetch and no waiting. */
export interface Io {
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}
