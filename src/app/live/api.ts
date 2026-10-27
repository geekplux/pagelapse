// Typed client for the Worker's archive API (`worker/routes/*`). Same-origin only; never called on first view.
import type { Capture, ExtractedPage } from '../../core/types.ts';

/** The Worker's error codes (`worker/http.ts`), plus `network` when the API itself cannot be reached. */
export type ApiErrorCode =
  | 'invalid_url' | 'no_captures' | 'excluded' | 'archive_rate_limited'
  | 'archive_unavailable' | 'too_large' | 'rate_limited' | 'not_found' | 'network';

/** A failed API call: its code, the Worker's message and, for rate limits, the seconds to wait. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly retryAfter: number | undefined;
  constructor(code: ApiErrorCode, message: string, retryAfter?: number) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** `GET /api/captures`: the sampled captures of a URL, oldest first. */
export interface CapturesResponse {
  url: string;
  totalCaptures: number;
  firstTs: string;
  lastTs: string;
  captures: Capture[];
}

/** `GET /api/snapshot`: one capture's extracted text. */
export type SnapshotResponse = ExtractedPage & { ts: string };

/** Fetches JSON from the API; non-2xx answers become an {@link ApiError}, an abort rethrows as is. */
async function get<T>(path: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError('network', 'We could not reach the Pagelapse server. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: ApiErrorCode; message?: string; retryAfter?: number }) | null;
  if (res.ok && body) return body;
  throw new ApiError(body?.error ?? 'archive_unavailable', body?.message ?? 'The server sent an answer we could not read.', body?.retryAfter);
}

/** The default number of sampled captures. */
export const MAX_CAPTURES = 16;

export const fetchCaptures = (url: string, signal: AbortSignal) =>
  get<CapturesResponse>(`/api/captures?url=${encodeURIComponent(url)}&max=${MAX_CAPTURES}`, signal);

export const fetchSnapshot = (url: string, ts: string, signal: AbortSignal) =>
  get<SnapshotResponse>(`/api/snapshot?url=${encodeURIComponent(url)}&ts=${ts}`, signal);

/** `POST /api/summaries`: one line per pair; `source: "rule"` pairs have no text (keep the local rule summary). */
export const fetchSummaries = (url: string, pairs: { from: string; to: string }[], signal: AbortSignal) =>
  get<{ summaries: { pair: string; source: 'ai' | 'rule'; text?: string }[] }>('/api/summaries', signal, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, pairs }),
  });
