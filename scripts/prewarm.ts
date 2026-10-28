// Pre-warms the Worker's KV cache for a list of pages, so a visitor who looks one of them up gets every answer from
// the cache and never waits on the Internet Archive (or its rate limit).
//
//   node scripts/prewarm.ts [--urls scripts/prewarm-urls.txt] [--out .cache/prewarm/kv-bulk.json]
//   pnpm exec wrangler kv bulk put --remote --binding CACHE .cache/prewarm/kv-bulk.json   # the maintainer's call
//
// It computes exactly what the Worker would store (worker/routes/captures.ts and snapshot.ts): the kept CDX listing
// under cdx:v2 and each sampled capture's extracted text under snap:v1, with the same keys, sampling and 2 MB cap.
// Raw responses are cached in .cache/prewarm/raw/ so a re-run never refetches; requests are serialised and spaced
// >= 1.5 s with the identified User-Agent, and a 429 stops the run (re-run later: it resumes from the cache).
// The only code besides the recorders that touches the live network; never imported by tests.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { HttpError, RateLimitedError, politeFetch } from '../src/archive/politeFetch.ts';
import { buildCdxUrl, dedupeAdjacentDigests, parseCdx } from '../src/core/cdx.ts';
import { extractPage } from '../src/core/extract.ts';
import { sampleCaptures } from '../src/core/sampling.ts';
import type { Capture } from '../src/core/types.ts';
import { rawCaptureUrl, validateTargetUrl } from '../src/core/url.ts';
import { DEFAULT_MAX, cdxKey, keptJson, snapKey } from '../worker/keys.ts';

const root = resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    urls: { type: 'string', default: 'scripts/prewarm-urls.txt' },
    out: { type: 'string', default: '.cache/prewarm/kv-bulk.json' },
  },
});

const rawDir = join(root, '.cache/prewarm/raw');
mkdirSync(rawDir, { recursive: true });
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let lastRequest = 0;
let requests = 0;

/** A raw response through the on-disk cache: `null` for a 404 or 403 (remembered), otherwise the text (or too large). */
async function cachedGet(url: string): Promise<{ text: string; truncated: boolean } | null> {
  const file = join(rawDir, `${createHash('sha256').update(url).digest('hex')}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  await delay(Math.max(0, lastRequest + 1500 - Date.now()));
  lastRequest = Date.now();
  requests++;
  let got: { text: string; truncated: boolean } | null;
  try {
    const res = await politeFetch(url, { retry429: false });
    got = { text: res.text, truncated: res.truncated };
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 403)) got = null;
    else throw err;
  }
  writeFileSync(file, JSON.stringify(got));
  return got;
}

const lines = readFileSync(resolve(root, args.urls), 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
const bulk: { key: string; value: string }[] = [];
const report: string[] = [];

try {
  for (const line of lines) {
    const check = validateTargetUrl(line);
    if (!check.ok) {
      report.push(`skip ${line}: ${check.message}`);
      continue;
    }
    const cdx = await cachedGet(buildCdxUrl('internet-archive', check.url));
    const all: Capture[] = cdx ? dedupeAdjacentDigests(parseCdx('internet-archive', cdx.text)) : [];
    if (!all.length) {
      report.push(`skip ${check.url}: no captures`);
      continue;
    }
    bulk.push({ key: await cdxKey(check.url), value: keptJson(all, Date.now()) });
    let stored = 0;
    for (const c of sampleCaptures(all, DEFAULT_MAX)) {
      const raw = await cachedGet(rawCaptureUrl('internet-archive', c.ts, check.url));
      if (!raw) continue;
      const page = raw.truncated ? { error: 'too_large' } : { ts: c.ts, ...extractPage(raw.text) };
      bulk.push({ key: await snapKey(check.url, c.ts), value: JSON.stringify(page) });
      stored++;
    }
    report.push(`ok   ${check.url}: ${all.length} captures, ${stored} of ${Math.min(DEFAULT_MAX, all.length)} sampled stored`);
    console.log(report.at(-1));
  }
} catch (err) {
  if (!(err instanceof RateLimitedError)) throw err;
  report.push(`stopped: the archive asked us to wait ${err.retryAfter} s; re-run later, it resumes from the cache`);
}

const out = resolve(root, args.out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(bulk));
console.log(`\n${report.join('\n')}\n\n${bulk.length} KV entries (${(JSON.stringify(bulk).length / 1e6).toFixed(1)} MB) in ${args.out}; ${requests} archive requests.`);
console.log(`Upload (production KV, the maintainer's call): pnpm exec wrangler kv bulk put --remote --binding CACHE ${args.out}`);
