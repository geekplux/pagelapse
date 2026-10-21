import { ARCHIVES } from '../archive/archives.ts';
import { isValidTimestamp } from './timestamp.ts';
import type { ArchiveId } from './types.ts';

/** Longest target URL we accept, before and after normalisation. */
export const MAX_URL_LENGTH = 2048;

/** Why a target URL was rejected. */
export type UrlErrorCode = 'empty' | 'invalid' | 'scheme' | 'credentials' | 'ip' | 'host' | 'too-long';

/** Result of {@link validateTargetUrl}: the normalised URL, or a reason and a user-facing message. */
export type UrlCheck = { ok: true; url: string } | { ok: false; code: UrlErrorCode; message: string };

const MESSAGES: Record<UrlErrorCode, string> = {
  empty: 'Enter a web address, for example example.org/about.',
  invalid: 'That does not look like a web address.',
  scheme: 'Only http:// and https:// addresses can be looked up.',
  credentials: 'Addresses with a username or password are not supported.',
  ip: 'Use a domain name, not an IP address.',
  host: 'Use a public domain name such as example.org.',
  'too-long': `Addresses are limited to ${MAX_URL_LENGTH} characters.`,
};
const TRACKING = /^(?:utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|igshid|twclid|mc_cid|mc_eid|_ga|_gl)$/i;
const LOCAL_HOST = /(?:^|\.)(?:localhost|local|internal)$/;

const paramKey = (segment: string) => new URLSearchParams(segment).keys().next().value ?? '';

/**
 * Removes tracking query parameters (`utm_*`, `fbclid`, `gclid`, ...) from a URL object in
 * place. Every other `key[=value]` segment is kept byte-for-byte, so the archived URL (and the
 * CDX lookup / cache key built from it) does not change encoding.
 */
export function stripTrackingParams(url: URL): URL {
  const kept = url.search
    .slice(1)
    .split('&')
    .filter((segment) => !TRACKING.test(paramKey(segment)));
  url.search = kept.join('&');
  return url;
}

/**
 * Normalises user input into a canonical URL string, or returns null if it cannot be
 * parsed: adds `https://` when no scheme is given, lowercases the host, drops one trailing dot
 * from it (`example.org.` is `example.org`), default ports, the fragment and tracking
 * parameters. Does not check whether the URL is allowed.
 */
export function normalizeTargetUrl(input: string): string | null {
  const raw = input.trim();
  // A scheme is "word:" not followed by a port number, so `example.org:8080/x` gets https://.
  const withScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw) ? raw : `https://${raw}`;
  if (!URL.canParse(withScheme)) return null;
  const url = new URL(withScheme);
  url.hash = '';
  if (url.hostname.length > 1 && url.hostname.endsWith('.')) url.hostname = url.hostname.slice(0, -1);
  return stripTrackingParams(url).href;
}

/** Normalises and validates a target URL: http(s) only, no credentials, a public dotted host name. */
export function validateTargetUrl(input: string): UrlCheck {
  const fail = (code: UrlErrorCode): UrlCheck => ({ ok: false, code, message: MESSAGES[code] });
  if (!input.trim()) return fail('empty');
  if (input.length > MAX_URL_LENGTH) return fail('too-long');
  const href = normalizeTargetUrl(input);
  if (href === null) return fail('invalid');
  const url = new URL(href);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail('scheme');
  if (url.username || url.password) return fail('credentials');
  if (url.hostname.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(url.hostname)) return fail('ip');
  const host = url.hostname;
  if (!host.includes('.') || host.split('.').includes('') || LOCAL_HOST.test(host)) return fail('host');
  if (href.length > MAX_URL_LENGTH) return fail('too-long');
  return { ok: true, url: href };
}

function replayUrl(archive: ArchiveId, ts: string, suffix: string, url: string): string {
  if (!isValidTimestamp(ts)) throw new RangeError(`invalid capture timestamp: ${ts}`);
  return `${ARCHIVES[archive].replay}${ts}${suffix}/${url}`;
}

/** URL of a capture's original bytes, without archive rewriting (the `id_` form). */
export function rawCaptureUrl(archive: ArchiveId, ts: string, url: string): string {
  return replayUrl(archive, ts, 'id_', url);
}

/** URL that replays a capture as the page looked, for an iframe (IA `if_`, Arquivo.pt `mp_`). */
export function replayFrameUrl(archive: ArchiveId, ts: string, url: string): string {
  return replayUrl(archive, ts, ARCHIVES[archive].frame, url);
}

/** URL of a capture in the archive's own viewer, for "open in archive" links. */
export function viewCaptureUrl(archive: ArchiveId, ts: string, url: string): string {
  return replayUrl(archive, ts, '', url);
}

/** Key of a capture pair, `"<fromTs>-<toTs>"`, as used by fixture summaries and caches. */
export function pairKey(from: string, to: string): string {
  return `${from}-${to}`;
}
