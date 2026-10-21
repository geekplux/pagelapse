import type { Env, Io } from './env.ts';
import { apiError } from './http.ts';
import { captures } from './routes/captures.ts';
import { health } from './routes/health.ts';
import { snapshot } from './routes/snapshot.ts';
import { summaries } from './routes/summaries.ts';

type Route = (req: Request, url: URL, env: Env, io: Io) => Promise<Response>;
const ROUTES: Record<string, Route> = {
  'GET /api/health': health, 'GET /api/captures': captures, 'GET /api/snapshot': snapshot, 'POST /api/summaries': summaries,
};
// Workers' fetch must be called unbound from globalThis, so wrap it.
const defaultIo: Io = { fetch: (input, init) => fetch(input, init) };

/**
 * Handles `/api/*` (static assets, including sample pictures, are served by Workers Static
 * Assets without invoking the Worker: `run_worker_first: ["/api/*"]`).
 */
export async function handle(req: Request, env: Env, io: Io = defaultIo): Promise<Response> {
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

export default { fetch: (req, env) => handle(req, env) } satisfies ExportedHandler<Env>;
