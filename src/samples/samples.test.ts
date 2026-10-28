import { describe, expect, it } from 'vitest';
import { parseSampleFixture } from '../core/fixture.ts';
import { DECK_CAPTURES, DECK_SAMPLE, defaultEntry, recorded, sampleFor, sampleName, samples } from './index.ts';
import config from './samples.config.json';
import catalog from 'virtual:sample-catalog';

const RAW = import.meta.glob<string>(['./*.json', '!./samples.config.json'], { query: '?raw', import: 'default', eager: true });
const KB = 1000;
/** Monetary figures and finance terms; no committed sample may state any (CLAUDE.md: nothing finance-related). */
const FINANCE =
  /[$€£¥]\s?\d|\bUS\$|\d[\d,.]*\s?(million|billion)\s+(dollars|euros)|\b(dollars|euros)\b|\bbudget\b|\brevenue\b|\bassets\b|\bfunding of\b|\bdonations? of (US)?[$€£¥]/i;

async function gzipBytes(text: string): Promise<number> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

describe('committed samples', () => {
  it('match the recorder config: the registry offers the recorded entries in config order; Wikipedia is the default', () => {
    const files = Object.keys(RAW).map((f) => f.slice(2, -5));
    // Every committed fixture has a config entry; a config entry may wait for its recording.
    expect(files.filter((id) => !config.some((c) => c.id === id))).toEqual([]);
    const shown = config.filter((c) => files.includes(c.id));
    expect(samples.map((s) => s.id)).toEqual(shown.map((c) => c.id));
    expect(samples.map((s) => s.url)).toEqual(shown.map((c) => c.url));
    expect(samples.map((s) => s.name)).toEqual(shown.map((c) => sampleName(c.label)));
    // Today's options, in order.
    expect(samples.map((s) => s.name)).toEqual(['Wikipedia: Internet Archive', 'NASA', 'Creative Commons']);
    expect(config[0]!.id).toBe('wikipedia-internet-archive');
    expect(defaultEntry.id).toBe('wikipedia-internet-archive');
    expect(DECK_SAMPLE).toBe(defaultEntry.id);
  });

  it('ships only the id, label, url and gallery card of each config entry to the app (the build-time catalog)', () => {
    const card = (id: string) => {
      const raw = RAW[`./${id}.json`];
      if (!raw) return undefined;
      const { snapshots } = parseSampleFixture(JSON.parse(raw));
      const shot = snapshots.findLast((x) => x.shot?.file && x.shot.status !== 'failed')?.shot?.file;
      return { captures: snapshots.length, firstTs: snapshots[0]!.ts, lastTs: snapshots.at(-1)!.ts, ...(shot && { shot }) };
    };
    expect(catalog).toEqual(config.map(({ id, label, url }) => ({ id, label, url, card: card(id) })));
    // Every recorded sample's card has a thumbnail, and the registry turns it into a picture URL.
    for (const s of samples) expect(s.card?.thumb).toMatch(new RegExp(`^/samples/${s.id}/\\d{14}-[0-9a-f]{8}\\.thumb\\.webp$`));
  });

  it('never offers an entry without a recorded fixture, and offers one as soon as it is recorded', () => {
    const entries = [
      { id: 'a', label: 'a.example home page', url: 'https://a.example/' },
      { id: 'nasa', label: 'NASA home page', url: 'https://www.nasa.gov/' },
      { id: 'b', label: 'B', url: 'https://b.example/' },
    ];
    expect(recorded(entries, { './a.json': 1, './b.json': 1 }).map((c) => c.id)).toEqual(['a', 'b']);
    expect(recorded(entries, { './a.json': 1, './nasa.json': 1, './b.json': 1 }).map((c) => c.id)).toEqual(['a', 'nasa', 'b']);
    expect(sampleName('NASA home page')).toBe('NASA');
    // The real config: NASA and Creative Commons carry their licences and money-figure filters, and are recorded, so offered.
    for (const id of ['nasa', 'creative-commons']) {
      expect(config.some((c) => c.id === id && c.license && c.attribution && c.dropBlocks && c.visualRedact)).toBe(true);
      expect(samples.some((s) => s.id === id)).toBe(!!RAW[`./${id}.json`]);
    }
  });

  it('a deep link to an unknown or retired sample opens the default; a recorded one opens itself', () => {
    expect(sampleFor('nope').id).toBe('wikipedia-internet-archive');
    expect(sampleFor(undefined).id).toBe('wikipedia-internet-archive');
    // git-scm and rust-lang were retired (no config entry, no fixture): old links land on the default.
    expect(sampleFor('git-scm').id).toBe('wikipedia-internet-archive');
    expect(sampleFor('nasa').id).toBe('nasa');
    expect(sampleFor('creative-commons').id).toBe('creative-commons');
  });

  it('trims the same money figures from the new samples as from Wikipedia (text and pictures)', () => {
    const cfg = (id: string) => config.find((c) => c.id === id)!;
    const drops = (id: string, text: string) => new RegExp(cfg(id).dropBlocks!, 'iu').test(text);
    const hides = (id: string, text: string) => new RegExp(cfg(id).visualRedact!.pattern, 'iu').test(text);
    for (const id of ['nasa', 'creative-commons']) {
      for (const t of ['A budget of $25.4 billion', 'US$ 300 million in revenue', 'Its assets grew']) expect([drops(id, t), hides(id, t)]).toEqual([true, true]);
      expect(drops(id, 'Webb sees a galaxy 13 billion light-years away')).toBe(false);
    }
    expect(drops('nasa', 'The fiscal year 2025 request')).toBe(true);
    for (const t of ['Donate', 'Make a donation today', 'Our fundraising campaign']) expect([drops('creative-commons', t), hides('creative-commons', t)]).toEqual([true, true]);
    expect(drops('creative-commons', 'Share your work under a CC licence')).toBe(false);
    for (const t of ['Store', 'SUPPORT US', 'Support CC', 'Help us build a vibrant commons']) expect(hides('creative-commons', t)).toBe(true);
    expect(hides('creative-commons', 'Restore your licence choice')).toBe(false);
    for (const t of ['Donate to Wikipedia', 'Donate']) expect(hides('wikipedia-internet-archive', t)).toBe(true);
    expect(hides('wikipedia-internet-archive', 'The Internet Archive is a nonprofit digital library')).toBe(false);
    expect(cfg('wikipedia-internet-archive').visualRedact!.selector).toMatch(/n-sitesupport.*pt-sitesupport/);
  });

  it.each(Object.entries(RAW))('%s is real, chronological, unique and small', (file, raw) => {
    const f = parseSampleFixture(JSON.parse(raw));
    const cfg = config.find((c) => `./${c.id}.json` === file)!;
    expect(f).toMatchObject({ id: cfg.id, url: cfg.url, source: { license: cfg.license, attribution: cfg.attribution } });
    expect(['internet-archive', 'arquivo-pt']).toContain(f.source.archive);
    expect(f.source.recorder).toMatch(/^pagelapse record-samples /);
    expect(f.snapshots.length).toBeGreaterThanOrEqual(8);
    expect(new Set(f.snapshots.map((s) => s.digest)).size).toBe(f.snapshots.length);
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(150 * KB);
  });

  it.each(Object.entries(RAW))('%s keeps no block its config drops (dropBlocks applied to the committed text)', (file, raw) => {
    const f = parseSampleFixture(JSON.parse(raw));
    const pattern = config.find((c) => `./${c.id}.json` === file)!.dropBlocks;
    if (!pattern) return;
    const drop = new RegExp(pattern, 'iu');
    expect(f.blocks.map((b) => b.t).filter((t) => drop.test(t))).toEqual([]);
  });

  it('the Creative Commons filter drops fundraising, sponsor and store lines, not harmless words', () => {
    const drop = new RegExp(config.find((c) => c.id === 'creative-commons')!.dropBlocks!, 'iu');
    for (const t of ['Help support the Commons.', 'Creative Commons 2011 Annual Campaign', 'Invest in open', 'please consider making a gift', 'our lead sponsor', 'CC Store', 'Buy Swag and Goodies', 'Shop CC Merch', 'Support CC In Style', 'Thank you to Private Internet Access']) expect([t, drop.test(t)]).toEqual([t, true]);
    for (const t of ['Free cloud storage for openly licensed works', 'Restore the original', 'Supporting open access in education', 'Shopify', 'Share your work']) expect([t, drop.test(t)]).toEqual([t, false]);
  });

  it.each(Object.entries(RAW))('%s states no monetary figures in any block', (_, raw) => {
    const f = parseSampleFixture(JSON.parse(raw));
    expect(f.blocks.map((b) => b.t).filter((t) => FINANCE.test(t))).toEqual([]);
    expect(f.snapshots.map((s) => s.title).filter((t) => FINANCE.test(t))).toEqual([]);
  });

  it('default sample is <= 40 KB gzip', async () => {
    expect(await gzipBytes(RAW[`./${defaultEntry.id}.json`]!)).toBeLessThanOrEqual(40 * KB);
  });

  it('the hero deck reserves the height of its sample\'s pictured captures', () => {
    const f = parseSampleFixture(JSON.parse(RAW[`./${DECK_SAMPLE}.json`]!));
    expect(f.snapshots.filter((s) => s.shot?.file)).toHaveLength(DECK_CAPTURES);
  });

  it('loads every registered sample once (loaded() then holds it)', async () => {
    for (const s of samples) {
      const f = await s.load();
      expect(f.id).toBe(s.id);
      expect(s.loaded()).toBe(f);
      expect(await s.load()).toBe(f);
    }
  });
});
