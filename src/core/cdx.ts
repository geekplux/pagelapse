import { ARCHIVES } from '../archive/archives.ts';
import { isValidTimestamp } from './timestamp.ts';
import type { ArchiveId, Capture } from './types.ts';

/**
 * CDX query for a URL's HTML captures: status 200, `text/html`, collapsed to at most one
 * row per month and per digest, returning only `timestamp,digest,length`.
 */
export function buildCdxUrl(archive: ArchiveId, url: string): string {
  const q = new URLSearchParams([
    ['url', url],
    ['output', 'json'],
    ['fl', 'timestamp,digest,length'],
    ['filter', 'statuscode:200'],
    ['filter', 'mimetype:text/html'],
    ['collapse', 'timestamp:6'],
    ['collapse', 'digest'],
  ]);
  return `${ARCHIVES[archive].cdx}?${q}`;
}

function toCapture(ts: unknown, digest: unknown, length: unknown): Capture[] {
  if (typeof ts !== 'string' || !isValidTimestamp(ts) || typeof digest !== 'string' || !digest) return [];
  const n = Number(length);
  return [{ ts, digest, length: Number.isFinite(n) && n > 0 ? n : 0 }];
}

/** Parses the Internet Archive's `output=json` (array of arrays, header row first). Skips malformed rows. */
export function parseCdxJson(body: string): Capture[] {
  const trimmed = body.trim();
  const rows: unknown = trimmed ? JSON.parse(trimmed) : [];
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const header = rows[0] as unknown[];
  const [ts, digest, length] = ['timestamp', 'digest', 'length'].map((f) => header.indexOf(f));
  return rows.slice(1).flatMap((r) => (Array.isArray(r) ? toCapture(r[ts!], r[digest!], r[length!]) : []));
}

/** Parses pywb's (Arquivo.pt) `output=json`: one JSON object per line. Skips malformed lines. */
export function parseCdxNdjson(body: string): Capture[] {
  return body.split('\n').flatMap((line) => {
    try {
      const o = JSON.parse(line) as Record<string, unknown>;
      return toCapture(o.timestamp, o.digest, o.length);
    } catch {
      return [];
    }
  });
}

/** Parses a CDX response in the given archive's dialect. */
export function parseCdx(archive: ArchiveId, body: string): Capture[] {
  return ARCHIVES[archive].cdxFormat === 'json' ? parseCdxJson(body) : parseCdxNdjson(body);
}

/** Drops captures whose digest equals the previous capture's (some CDX servers ignore `collapse`). */
export function dedupeAdjacentDigests(captures: readonly Capture[]): Capture[] {
  return captures.filter((c, i) => i === 0 || c.digest !== captures[i - 1]!.digest);
}
