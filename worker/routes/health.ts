import { APP_VERSION } from '../../src/archive/politeFetch.ts';
import { json } from '../http.ts';

/** `GET /api/health`: liveness and capabilities. No upstream calls, no bindings needed. */
export const health = async (): Promise<Response> => json({ ok: true, version: APP_VERSION, ai: 'unavailable' });
