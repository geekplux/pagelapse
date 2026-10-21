import { APP_VERSION } from '../../src/archive/politeFetch.ts';
import type { Env } from '../env.ts';
import { json } from '../http.ts';
import { aiAvailable } from '../summarise.ts';

/** `GET /api/health`: liveness and capabilities. No upstream calls; `ai` is "available" only with the production binding. */
export const health = async (_req: Request, _url: URL, env: Env): Promise<Response> =>
  json({ ok: true, version: APP_VERSION, ai: aiAvailable(env) ? 'available' : 'unavailable' });
