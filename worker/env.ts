/** Bindings from wrangler.jsonc. `UPSTREAM_LIMIT` is optional so local runs and tests work without it. */
export interface Env {
  CACHE: KVNamespace;
  UPSTREAM_LIMIT?: RateLimit;
}

/** Injectable IO, so tests run the real handlers with a recorded fake fetch and no waiting. */
export interface Io {
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}
