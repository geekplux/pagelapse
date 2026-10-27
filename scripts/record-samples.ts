// Records the built-in samples from a web archive into trimmed, block-interned fixtures.
// The only code that touches the live network; never imported by tests.
//
// Usage: pnpm record:samples [--archive internet-archive|arquivo-pt] [--only <id>[,<id>…]] [--max 14] [--dry-run] [--offline]
// --only takes one id or a comma-separated list (`--only nasa,creative-commons`); without it every config entry is recorded.
// --offline re-records from .cache/record/ only and fails on a cache miss instead of fetching.
// Politeness: one request at a time, >= 1.5 s apart, identified User-Agent, and every response
// (CDX and raw HTML) cached in .cache/record/ so re-runs never refetch. Delete it to refresh.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { writeFixture } from './lib/fixtureFile.ts';
import { pickSamples, readSampleConfig } from './lib/sampleConfig.ts';
import { ARCHIVE_IDS } from '../src/archive/archives.ts';
import { APP_VERSION, HttpError, politeFetch } from '../src/archive/politeFetch.ts';
import { buildCdxUrl, dedupeAdjacentDigests, parseCdx } from '../src/core/cdx.ts';
import { EXTRACTOR_VERSION, extractPage } from '../src/core/extract.ts';
import { parseSampleFixture } from '../src/core/fixture.ts';
import { sampleCaptures } from '../src/core/sampling.ts';
import { rawCaptureUrl } from '../src/core/url.ts';
import type { ArchiveId, FixtureBlock, FixtureSnapshot } from '../src/core/types.ts';

interface SampleConfig {
  id: string;
  label: string;
  url: string;
  description: string;
  maxChars: number;
  /** Optional case-insensitive regex; matching blocks are trimmed from every capture (noise, money figures). */
  dropBlocks?: string;
  license: string;
  attribution: string;
}

const GAP_MS = 1500;
const root = resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    archive: { type: 'string', default: 'internet-archive' },
    only: { type: 'string' },
    max: { type: 'string', default: '14' },
    'dry-run': { type: 'boolean', default: false },
    offline: { type: 'boolean', default: false },
  },
});
const archive = args.archive as ArchiveId;
if (!ARCHIVE_IDS.includes(archive)) throw new Error(`--archive must be one of ${ARCHIVE_IDS.join(', ')}`);
const max = Number(args.max);
const configs = pickSamples(readSampleConfig<SampleConfig>(root), args.only);

const cacheDir = join(root, '.cache/record', archive);
mkdirSync(cacheDir, { recursive: true });
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let lastRequest = 0;
let requests = 0;

/** GET through the on-disk cache; network requests are serialised and spaced >= 1.5 s. */
async function cachedGet(url: string): Promise<string> {
  const file = join(cacheDir, `${createHash('sha256').update(url).digest('hex')}.txt`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  if (args.offline) throw new Error(`--offline: ${url} is not in .cache/record/${archive}/`);
  await delay(Math.max(0, lastRequest + GAP_MS - Date.now()));
  console.error(`GET ${url}`);
  requests++;
  try {
    const { text, truncated } = await politeFetch(url, { sleep: (ms) => delay(Math.max(ms, GAP_MS)) });
    if (truncated) console.error('  (body cut at 2 MB)');
    writeFileSync(file, text);
    return text;
  } finally {
    lastRequest = Date.now();
  }
}

const rows: string[][] = [['id', 'cdx', 'unique', 'sampled', 'kept', 'first', 'last', 'blocks', 'raw KB', 'gzip KB']];
for (const cfg of configs) {
  const seen = new Set<string>();
  const all = dedupeAdjacentDigests(parseCdx(archive, await cachedGet(buildCdxUrl(archive, cfg.url))));
  const unique = all.filter((c) => !seen.has(c.digest) && seen.add(c.digest));
  const sampled = sampleCaptures(unique, max);
  if (args['dry-run']) {
    rows.push([cfg.id, String(all.length), String(unique.length), String(sampled.length), '-', sampled[0]?.ts ?? '-', sampled.at(-1)?.ts ?? '-', '-', '-', '-']);
    continue;
  }
  // Pictures (record-visuals.ts) are kept across text re-records.
  const file = join(root, 'src/samples', `${cfg.id}.json`);
  const old = existsSync(file) ? parseSampleFixture(JSON.parse(readFileSync(file, 'utf8'))) : undefined;
  const blocks: FixtureBlock[] = [];
  const index = new Map<string, number>();
  const snapshots: FixtureSnapshot[] = [];
  let previous = '';
  const drop = cfg.dropBlocks ? new RegExp(cfg.dropBlocks, 'iu') : null;
  for (const cap of sampled) {
    let html: string;
    try {
      html = await cachedGet(rawCaptureUrl(archive, cap.ts, cfg.url));
    } catch (err) {
      if (!(err instanceof HttpError)) throw err; // rate limits and outages stop the run
      console.error(`  skipped ${cap.ts}: ${err.message}`);
      continue;
    }
    const page = extractPage(html);
    // Trim at whole blocks, so no heading or paragraph ends mid-word ("Text co").
    let room = cfg.maxChars;
    const cut = page.blocks.findIndex((b) => (room -= b.text.length) < 0);
    if (cut >= 0) [page.blocks, page.truncated] = [page.blocks.slice(0, cut), true];
    if (drop) page.blocks = page.blocks.filter((b) => !drop.test(b.text));
    const content = JSON.stringify([page.title, page.blocks]);
    // Near-empty shells (redirect stubs, script-only pages) and content-identical captures add nothing.
    if (page.blocks.length < 3 || content === previous) continue;
    previous = content;
    const blockIds = page.blocks.map(({ kind, text, level }) => {
      const key = `${kind}|${level ?? ''}|${text}`;
      if (!index.has(key)) index.set(key, blocks.push(level ? { k: kind, t: text, l: level } : { k: kind, t: text }) - 1);
      return index.get(key)!;
    });
    const shot = old?.snapshots.find((x) => x.ts === cap.ts)?.shot;
    snapshots.push({ ts: cap.ts, digest: cap.digest, title: page.title, blockIds, ...(page.truncated ? { truncated: true } : {}), ...(shot && { shot }) });
  }
  const fixture = parseSampleFixture({
    schema: 1,
    id: cfg.id,
    label: cfg.label,
    url: cfg.url,
    description: cfg.description,
    source: {
      archive,
      recordedAt: new Date().toISOString().slice(0, 10),
      recorder: `pagelapse record-samples ${APP_VERSION} (extractor v${EXTRACTOR_VERSION})`,
      license: cfg.license,
      attribution: cfg.attribution,
    },
    blocks,
    snapshots,
    ...(old?.featured && old.featured.split('-').every((t) => snapshots.some((x) => x.ts === t)) && { featured: old.featured }),
    ...(old?.visual && { visual: old.visual }),
  });
  const json = writeFixture(file, fixture);
  const kb = (n: number) => (n / 1000).toFixed(1);
  rows.push([cfg.id, String(all.length), String(unique.length), String(sampled.length), String(snapshots.length), snapshots[0]!.ts, snapshots.at(-1)!.ts, String(blocks.length), kb(Buffer.byteLength(json)), kb(gzipSync(json).length)]);
}

const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i]!)).join('  '));
console.log(`\n${archive}: ${requests} network request(s); the rest came from .cache/record/${archive}/`);
