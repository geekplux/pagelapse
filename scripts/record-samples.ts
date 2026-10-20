// Records the built-in samples from a web archive into trimmed, block-interned fixtures.
// The only code that touches the live network (AC 20); never imported by tests.
//
// Usage: pnpm record:samples [--archive internet-archive|arquivo-pt] [--only <id>] [--max 14] [--dry-run]
// Politeness: one request at a time, >= 1.5 s apart, identified User-Agent, and every response
// (CDX and raw HTML) cached in .cache/record/ so re-runs never refetch. Delete it to refresh.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { ARCHIVE_IDS } from '../src/archive/archives.ts';
import { APP_VERSION, HttpError, politeFetch } from '../src/archive/politeFetch.ts';
import { buildCdxUrl, dedupeAdjacentDigests, parseCdx } from '../src/core/cdx.ts';
import { EXTRACTOR_VERSION, extractPage } from '../src/core/extract.ts';
import { parseSampleFixture } from '../src/core/fixture.ts';
import { sampleCaptures } from '../src/core/sampling.ts';
import { rawCaptureUrl } from '../src/core/url.ts';
import type { ArchiveId, FixtureBlock, FixtureSnapshot, SampleFixture } from '../src/core/types.ts';

interface SampleConfig {
  id: string;
  label: string;
  url: string;
  description: string;
  maxChars: number;
  /** Optional regex; matching blocks are trimmed from this sample (noise, money figures). */
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
  },
});
const archive = args.archive as ArchiveId;
if (!ARCHIVE_IDS.includes(archive)) throw new Error(`--archive must be one of ${ARCHIVE_IDS.join(', ')}`);
const max = Number(args.max);
const configs = (JSON.parse(readFileSync(join(root, 'src/samples/samples.config.json'), 'utf8')) as SampleConfig[]).filter(
  (c) => !args.only || c.id === args.only,
);
if (!configs.length) throw new Error(`no sample with id "${args.only}"`);

const cacheDir = join(root, '.cache/record', archive);
mkdirSync(cacheDir, { recursive: true });
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let lastRequest = 0;
let requests = 0;

/** GET through the on-disk cache; network requests are serialised and spaced >= 1.5 s. */
async function cachedGet(url: string): Promise<string> {
  const file = join(cacheDir, `${createHash('sha256').update(url).digest('hex')}.txt`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
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

/** One array item per line: small files with reviewable git diffs. */
function serialise(fixture: SampleFixture): string {
  const fields = Object.entries(fixture).map(([k, v]) =>
    Array.isArray(v) ? `"${k}": [\n${v.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n]` : `"${k}": ${JSON.stringify(v)}`,
  );
  return `{\n${fields.join(',\n')}\n}\n`;
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
  const blocks: FixtureBlock[] = [];
  const index = new Map<string, number>();
  const snapshots: FixtureSnapshot[] = [];
  let previous = '';
  for (const cap of sampled) {
    let html: string;
    try {
      html = await cachedGet(rawCaptureUrl(archive, cap.ts, cfg.url));
    } catch (err) {
      if (!(err instanceof HttpError)) throw err; // rate limits and outages stop the run
      console.error(`  skipped ${cap.ts}: ${err.message}`);
      continue;
    }
    const page = extractPage(html, { maxChars: cfg.maxChars });
    if (cfg.dropBlocks) page.blocks = page.blocks.filter((b) => !new RegExp(cfg.dropBlocks!, 'u').test(b.text));
    const content = JSON.stringify([page.title, page.blocks]);
    // Near-empty shells (redirect stubs, script-only pages) and content-identical captures add nothing.
    if (page.blocks.length < 3 || content === previous) continue;
    previous = content;
    const blockIds = page.blocks.map(({ kind, text, level }) => {
      const key = `${kind}|${level ?? ''}|${text}`;
      if (!index.has(key)) index.set(key, blocks.push(level ? { k: kind, t: text, l: level } : { k: kind, t: text }) - 1);
      return index.get(key)!;
    });
    snapshots.push({ ts: cap.ts, digest: cap.digest, title: page.title, blockIds, ...(page.truncated ? { truncated: true } : {}) });
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
      recorder: `wayback-diff record-samples ${APP_VERSION} (extractor v${EXTRACTOR_VERSION})`,
      license: cfg.license,
      attribution: cfg.attribution,
    },
    blocks,
    snapshots,
  });
  const json = serialise(fixture);
  writeFileSync(join(root, 'src/samples', `${cfg.id}.json`), json);
  const kb = (n: number) => (n / 1000).toFixed(1);
  rows.push([cfg.id, String(all.length), String(unique.length), String(sampled.length), String(snapshots.length), snapshots[0]!.ts, snapshots.at(-1)!.ts, String(blocks.length), kb(Buffer.byteLength(json)), kb(gzipSync(json).length)]);
}

const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i]!)).join('  '));
console.log(`\n${archive}: ${requests} network request(s); the rest came from .cache/record/${archive}/`);
