// Records a picture (top of page, 1280×800) of every built-in sample capture from Arquivo.pt
// replay, as committed WebP files in public/samples/<id>/, and writes `shot`/`visual`/`featured`
// into the fixtures. Like record-samples.ts it is the only code here that touches the network
// and is never imported by tests.
//
// Usage: pnpm record:visuals [--only <id>[,<id>…]] [--max <captures to load this run>] [--offline] [--dry-run]
// Chrome: /usr/bin/google-chrome, or set CHROME_PATH (macOS: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome").
// It pictures recorded samples only: run `pnpm record:samples` for a new entry first (an entry without its fixture is skipped).
// The capture's `mp_` replay is loaded in an iframe of a local page: framed, pywb's top-frame
// redirect into Arquivo.pt's own viewer does not fire. Only arquivo.pt hosts load (pages still
// call live fonts and tag managers). Politeness: one browser, one capture at a time, >= 5 s
// apart, identified User-Agent, and every screenshot cached in .cache/record/shots/ so re-runs
// never reload a capture. --offline re-encodes from that cache with every request blocked.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, type Page, type Request, chromium } from 'playwright-core';
import { APP_VERSION, USER_AGENT } from '../src/archive/politeFetch.ts';
import { fixtureToSnapshots, parseSampleFixture } from '../src/core/fixture.ts';
import { buildTimeline } from '../src/core/timeline.ts';
import type { SampleFixture, ShotRef } from '../src/core/types.ts';
import { replayFrameUrl } from '../src/core/url.ts';
import { writeFixture } from './lib/fixtureFile.ts';
import { encodeWithin, greyPixels } from './lib/webp.ts';
import { isRecorded, pickSamples, readSampleConfig } from './lib/sampleConfig.ts';

interface VisualConfig {
  id: string;
  /** The first view's change, `"<fromTs>-<toTs>"`, picked from the delta table below. */
  featured?: string;
  /** Elements matching `selector` whose text matches `pattern` (case-insensitive) are hidden before the screenshot. */
  visualRedact?: { selector: string; pattern: string; note: string };
  /** Captures reviewed by eye and dropped (`ts` → reason), e.g. replayed without their main stylesheet. */
  visualDrop?: Record<string, string>;
}
type Meta = Omit<ShotRef, 'file'>;

const GAP_MS = 5000;
const QUIET_MS = 2000;
const CAP_MS = 15_000;
const FULL = { width: 960, height: 600, quality: 0.62, max: 64_000 };
const THUMB = { width: 320, height: 200, quality: 0.5, max: 8_000 };
const ARCHIVE_HOST = /(^|\.)arquivo\.pt$/;
const root = resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: { only: { type: 'string' }, max: { type: 'string', default: '99' }, offline: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false } },
});
const configs = pickSamples(readSampleConfig<VisualConfig>(root), args.only).filter((c) => {
  if (isRecorded(root, c.id)) return true;
  console.error(`skipped ${c.id}: src/samples/${c.id}.json is not recorded yet (run pnpm record:samples -- --only ${c.id} first)`);
  return false;
});
if (!configs.length) throw new Error('no recorded sample to picture');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hosts = new Map<string, number>();
const tally = (key: string) => hosts.set(key, (hosts.get(key) ?? 0) + 1);
let browser: Browser | undefined;
let lastCapture = 0;
let captured = 0;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void Promise.race([browser?.close(), delay(5000)]).finally(() => process.exit(130)));
}

/** Loads one capture in the harness frame, waits for it to settle, redacts, and screenshots it. */
async function capture(page: Page, url: string, redact?: VisualConfig['visualRedact']): Promise<{ png?: Buffer; meta: Meta }> {
  const inflight = new Set<Request>();
  const missing = { css: 0, img: 0 };
  let last = Date.now();
  let doc = 0;
  const miss = (r: Request) => {
    if (!ARCHIVE_HOST.test(new URL(r.url()).hostname)) return;
    if (r.resourceType() === 'stylesheet') missing.css++;
    if (r.resourceType() === 'image') missing.img++;
  };
  const done = (r: Request) => {
    inflight.delete(r);
    last = Date.now();
  };
  page.on('request', (r) => {
    inflight.add(r).delete(r.redirectedFrom()!);
    last = Date.now();
  });
  page.on('requestfinished', done);
  page.on('requestfailed', (r) => {
    done(r);
    if (r.failure()?.errorText !== 'net::ERR_BLOCKED_BY_CLIENT') miss(r);
  });
  page.on('response', (res) => {
    if (res.request().isNavigationRequest() && res.frame() !== page.mainFrame()) doc = res.status();
    else if (res.status() >= 400) miss(res.request());
  });
  try {
    await page.setContent(`<style>body{margin:0;overflow:hidden}</style><iframe src="${url}" width="1280" height="800" style="border:0;display:block"></iframe>`, { waitUntil: 'domcontentloaded' });
    const frame = page.mainFrame().childFrames()[0]!;
    try {
      await frame.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    } catch {
      return { meta: { status: 'failed', settle: 'cap', reason: 'timeout' } };
    }
    let settle: Meta['settle'] = 'cap';
    for (const start = Date.now(); Date.now() - start < CAP_MS; await delay(100)) {
      if (!inflight.size && Date.now() - last >= QUIET_MS) {
        settle = 'quiet';
        break;
      }
    }
    await frame.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))])).catch(() => {});
    await delay(500);
    const redacted = redact
      ? await frame.evaluate(({ selector, pattern }) => {
          const re = new RegExp(pattern, 'iu');
          let n = 0;
          for (const el of document.querySelectorAll<HTMLElement>(selector)) {
            if (!el.checkVisibility() || !re.test(el.textContent ?? '')) continue;
            el.style.setProperty('display', 'none', 'important');
            n++;
          }
          return n;
        }, redact)
      : 0;
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 }, animations: 'disabled' });
    const grey = await greyPixels(page, png, 64, 40);
    const mode = Math.max(...Array.from({ length: 256 }, (_, v) => grey.filter((g) => g === v).length));
    const reason = doc !== 200 ? `http ${doc}` : mode / grey.length > 0.98 ? 'blank page' : undefined;
    const status = reason ? 'failed' : missing.css > 0 || missing.img > 2 ? 'partial' : 'ok';
    const meta: Meta = { status, settle, ...((missing.css || missing.img) && { missing }), ...(redacted && { redacted }), ...(reason && { reason }) };
    return { png, meta };
  } finally {
    page.removeAllListeners();
  }
}

const sha8 = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 8);
const table = (rows: string[][]) => {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i]!)).join('  '));
};
const shots = [['id', 'ts', 'status', 'settle', 'full KB', 'thumb KB', 'missing css/img', 'redacted']];
const deltas = [['id', 'change', 'visual delta', 'shots']];

try {
  if (!args['dry-run']) {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  }
  const context = await browser?.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce', timezoneId: 'UTC', userAgent: USER_AGENT });
  await context?.route('**/*', (route) => {
    const req = route.request();
    const host = new URL(req.url()).hostname;
    const allowed = !args.offline && ARCHIVE_HOST.test(host) && req.resourceType() !== 'media' && !req.url().includes('/static/js/ruffle/');
    tally(`${allowed ? 'loaded' : 'blocked'} ${host} ${req.resourceType()}`);
    return allowed ? route.continue() : route.abort('blockedbyclient');
  });
  const page = await context?.newPage();
  for (const cfg of configs) {
    const file = join(root, 'src/samples', `${cfg.id}.json`);
    const fixture: SampleFixture = parseSampleFixture(JSON.parse(readFileSync(file, 'utf8')));
    const cacheDir = join(root, '.cache/record/shots', cfg.id);
    const outDir = join(root, 'public/samples', cfg.id);
    mkdirSync(cacheDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });
    const keep = new Set<string>();
    const grey = new Map<string, number[]>();
    for (const snap of fixture.snapshots) {
      const [pngFile, metaFile] = ['png', 'json'].map((ext) => join(cacheDir, `${snap.ts}.${ext}`)) as [string, string];
      const url = replayFrameUrl('arquivo-pt', snap.ts, fixture.url);
      if (!existsSync(metaFile)) {
        if (args.offline) throw new Error(`--offline: ${snap.ts} of ${cfg.id} is not in .cache/record/shots/`);
        if (args['dry-run'] || captured >= Number(args.max)) {
          console.error(`not loaded this run: ${url}`);
          continue;
        }
        await delay(Math.max(0, lastCapture + GAP_MS - Date.now()));
        console.error(`capture ${url}`);
        const { png, meta } = await capture(page!, url, cfg.visualRedact);
        lastCapture = Date.now();
        captured++;
        if (png) writeFileSync(pngFile, png);
        writeFileSync(metaFile, `${JSON.stringify(meta)}\n`);
      }
      if (args['dry-run']) continue;
      const cached = JSON.parse(readFileSync(metaFile, 'utf8')) as Meta;
      const dropped = cfg.visualDrop?.[snap.ts];
      const meta: Meta = dropped ? { status: 'failed', settle: cached.settle, reason: dropped } : cached;
      snap.shot = meta;
      let sizes = ['-', '-'];
      if (meta.status !== 'failed') {
        const png = readFileSync(pngFile);
        const [full, thumb] = [await encodeWithin(page!, png, FULL), await encodeWithin(page!, png, THUMB)];
        const name = `${snap.ts}-${sha8(full)}`;
        writeFileSync(join(outDir, `${name}.webp`), full);
        writeFileSync(join(outDir, `${name}.thumb.webp`), thumb);
        keep.add(`${name}.webp`).add(`${name}.thumb.webp`);
        snap.shot = { file: name, ...meta };
        grey.set(snap.ts, await greyPixels(page!, png, 64, 40));
        sizes = [full, thumb].map((b) => (b.length / 1000).toFixed(1));
      }
      shots.push([cfg.id, snap.ts, meta.status, meta.settle, ...sizes, meta.missing ? `${meta.missing.css}/${meta.missing.img}` : '-', String(meta.redacted ?? '-')]);
    }
    if (args['dry-run']) continue;
    for (const f of readdirSync(outDir)) if (!keep.has(f)) rmSync(join(outDir, f)); // orphans of earlier runs
    for (const e of buildTimeline(fixture.url, fixtureToSnapshots(fixture)).entries) {
      const [a, b] = [grey.get(e.from), grey.get(e.to)];
      const delta = a && b ? (a.reduce((n, v, i) => n + Math.abs(v - b[i]!), 0) / a.length).toFixed(1) : '-';
      const status = (ts: string) => fixture.snapshots.find((s) => s.ts === ts)?.shot?.status;
      deltas.push([cfg.id, `${e.from}-${e.to}`, delta, `${status(e.from)}/${status(e.to)}`]);
    }
    const redacted = fixture.snapshots.reduce((n, s) => n + (s.shot?.redacted ?? 0), 0);
    fixture.visual = {
      archive: 'arquivo-pt',
      recordedAt: captured || !fixture.visual ? new Date().toISOString().slice(0, 10) : fixture.visual.recordedAt,
      recorder: `pagelapse record-visuals ${APP_VERSION} (chrome ${browser!.version()})`,
      viewport: { w: 1280, h: 800 },
      full: { w: 960, h: 600 },
      thumb: { w: 320, h: 200 },
      format: 'webp',
      attribution: 'Screenshots of archived captures as replayed by Arquivo.pt, top of page only; page designs belong to their authors.',
      ...(redacted && cfg.visualRedact && { notes: [cfg.visualRedact.note] }),
    };
    if (cfg.featured) fixture.featured = cfg.featured;
    writeFixture(file, parseSampleFixture(fixture));
  }
} finally {
  await Promise.race([browser?.close(), delay(5000)]);
}

table(shots);
console.log();
table(deltas);
console.log(`\nrequests by host and type (${captured} capture(s) loaded this run):`);
for (const [k, n] of [...hosts].sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);
