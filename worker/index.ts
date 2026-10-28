import { memoryKv } from './cache.ts';
import type { Bindings, Env, Io } from './env.ts';
import { apiError } from './http.ts';
import { captures } from './routes/captures.ts';
import { gallery, share } from './routes/gallery.ts';
import { health } from './routes/health.ts';
import { snapshot } from './routes/snapshot.ts';
import { summaries } from './routes/summaries.ts';

type Route = (req: Request, url: URL, env: Env, io: Io) => Promise<Response>;
const ROUTES: Record<string, Route> = {
  'GET /api/health': health, 'GET /api/captures': captures, 'GET /api/snapshot': snapshot, 'POST /api/summaries': summaries,
  'GET /api/gallery': gallery, 'POST /api/gallery': share,
};
// Workers' fetch must be called unbound from globalThis, so wrap it.
const defaultIo: Io = { fetch: (input, init) => fetch(input, init) };
/** Used only without a `CACHE` binding (previews): one per isolate, so a preview still caches between requests. */
let fallbackKv: KVNamespace | undefined;

/**
 * Handles `/api/*` (static assets, including sample pictures, are served by Workers Static
 * Assets without invoking the Worker: `run_worker_first: ["/api/*"]`). Without a `CACHE` binding (Workers Builds
 * previews) the routes get an in-memory cache instead, so nothing fails and production KV is never needed.
 */
export async function handle(req: Request, bindings: Bindings, io: Io = defaultIo): Promise<Response> {
  const env: Env = bindings.CACHE ? (bindings as Env) : { ...bindings, CACHE: (fallbackKv ??= memoryKv()) };
  const url = new URL(req.url);
  const route = ROUTES[`${req.method} ${url.pathname}`];
  if (!route) return apiError('not_found', `No API endpoint at ${req.method} ${url.pathname}.`);
  try {
    return await route(req, url, env, io);
  } catch (err) {
    console.error('api error', err);
    return apiError('archive_unavailable', 'Something went wrong while reading the archive. Try again later.');
  }
}

export default { fetch: (req, env) => handle(req, env) } satisfies ExportedHandler<Bindings>;
