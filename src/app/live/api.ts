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

/** One page in "Recently explored" (worker/routes/gallery.ts). */
export interface GalleryEntry {
  url: string;
  title: string;
  captures: number;
  firstTs: string;
  lastTs: string;
  added: number;
  /** Each meaningful change as `[where along the years, 0 to 1000; how much changed, 0 to 100]`, oldest first. */
  changes?: [number, number][];
}

/** `GET /api/gallery`: the latest shared pages, newest first, and whether there are more than the home page shows. */
export const fetchGallery = (signal: AbortSignal) => get<{ entries: GalleryEntry[]; more?: boolean }>('/api/gallery', signal);

/** `GET /api/gallery?all`: one page of every shared page, newest first, and the cursor of the next page, if any. */
export const fetchExplored = (cursor: string | undefined, signal: AbortSignal) =>
  get<{ entries: GalleryEntry[]; cursor?: string }>(`/api/gallery?all${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, signal);

/** `POST /api/gallery`: lists a page the visitor has just looked up in "Recently explored". */
export const shareToGallery = (url: string, signal: AbortSignal) =>
  get<{ shared: true }>('/api/gallery', signal, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });

/** Only a plain address (no query) can be shared: a query can hold private tokens (the Worker refuses it too). */
export const shareable = (url: string) => {
  try {
    return !new URL(url).search;
  } catch {
    return false;
  }
};
