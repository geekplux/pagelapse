/** Machine-readable API error codes; the UI maps each to a specific, actionable message (AC 14). */
export type ErrorCode =
  | 'invalid_url' | 'no_captures' | 'excluded' | 'archive_rate_limited'
  | 'archive_unavailable' | 'too_large' | 'rate_limited' | 'not_found' | 'bad_request';

const STATUS: Record<ErrorCode, number> = {
  invalid_url: 400, no_captures: 404, excluded: 403, archive_rate_limited: 503,
  archive_unavailable: 502, too_large: 422, rate_limited: 429, not_found: 404, bad_request: 400,
};

/** Headers on every API response: JSON is never sniffed, framed, or read cross-origin. */
const SECURITY: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** A JSON response with the security headers. */
export function json(body: unknown, status = 200, cacheControl = 'no-store', extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY, 'Cache-Control': cacheControl, ...extra } });
}

/** `{error, message, retryAfter?}` with the code's status; `retryAfter` (s) also sets `Retry-After`. */
export function apiError(error: ErrorCode, message: string, retryAfter?: number): Response {
  const extra: Record<string, string> = retryAfter ? { 'Retry-After': String(retryAfter) } : {};
  return json({ error, message, ...(retryAfter && { retryAfter }) }, STATUS[error], 'no-store', extra);
}
