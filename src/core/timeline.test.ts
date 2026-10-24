import { describe, expect, it } from 'vitest';
import git from '../samples/git-scm.json';
import rust from '../samples/rust-lang.json';
import wiki from '../samples/wikipedia-internet-archive.json';
import { MAX_RECORD_CHARS, MAX_SNIPPET_CHARS, toChangeRecord } from './changeRecord.ts';
import { diffPages } from './diff.ts';
import { fixtureToSnapshots, parseSampleFixture } from './fixture.ts';
import { MAX_RULE_SUMMARY_CHARS, ruleSummary } from './ruleSummary.ts';
import { MAGNITUDE_THRESHOLDS } from './score.ts';
import { appendSnapshot, buildTimeline, emptyTimeline, trivialEntries } from './timeline.ts';
import type { ChangeRecord, SnapshotPage } from './types.ts';

const samples = [wiki, git, rust].map((j) => parseSampleFixture(j));
const snap = (n: number, texts: string[], title = 'Field notes'): SnapshotPage => ({
  ts: `2020010${n}000000`,
  digest: `d${n}`,
  title,
  blocks: texts.map((text) => ({ kind: 'paragraph', text })),
});
const snippets = (r: ChangeRecord) => [r.title, ...r.headingsAdded, ...r.headingsRemoved, ...r.added, ...r.removed, ...r.modified.flatMap((m) => [m.before, m.after])];
const BASE = Array.from({ length: 10 }, (_, i) => `Paragraph ${'abcdefghij'[i]} has ten plain words about the river and its birds.`);

describe('change records and rule summaries over every sample pair', () => {
  const pairs = samples.flatMap((f) => {
    const s = fixtureToSnapshots(f);
    return s.flatMap((a, i) => s.slice(i + 1).map((b) => [a, b] as const));
  });

  it(`serialise to <= ${MAX_RECORD_CHARS} chars, snippets <= ${MAX_SNIPPET_CHARS}, with headings`, () => {
    for (const [a, b] of pairs) {
      const diff = diffPages(a, b);
      const r = toChangeRecord(diff, a, b);
      expect(JSON.stringify(r).length).toBeLessThanOrEqual(MAX_RECORD_CHARS);
      for (const s of snippets(r)) expect(s.length).toBeLessThanOrEqual(MAX_SNIPPET_CHARS);
      const headingAdded = diff.ops.some((o) => o.type === 'added' && o.block.kind === 'heading');
      expect(r.headingsAdded.length > 0 || !headingAdded).toBe(true);
      const summary = ruleSummary(r);
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.length).toBeLessThanOrEqual(MAX_RULE_SUMMARY_CHARS);
      const named = [...r.headingsAdded, ...(r.headingsRenamed ?? []).flat()];
      expect(!named.length || named.some((h) => summary.includes(h.slice(0, 20)))).toBe(true);
    }
  });
});

describe('ruleSummary', () => {
  it('names the title or a heading, else counts passages and words', () => {
    const [a, b] = [snap(1, BASE), snap(2, [...BASE, 'A brand new closing paragraph.'], 'Field notes, revised')];
    expect(ruleSummary(toChangeRecord(diffPages(a, b), a, b))).toBe('Title changed to "Field notes, revised" (+5 / −0 words)');
    const c = { ...b, title: a.title, blocks: [{ kind: 'heading' as const, text: 'Downloads', level: 2 as const }, ...b.blocks] };
    expect(ruleSummary(toChangeRecord(diffPages(a, c), a, c))).toBe('Added section "Downloads" (+6 / −0 words)');
    const d = snap(3, [BASE[0]!.replace('river', 'lake'), ...BASE.slice(1)]);
    expect(ruleSummary(toChangeRecord(diffPages(a, d), a, d))).toBe('Reworded 1 passage (+1 / −1 words)');
  });

  it('reads a reworded heading as a rename, calls out version bumps, and names an informative heading', () => {
    const h = (text: string) => ({ kind: 'heading' as const, text, level: 2 as const });
    const a = { ...snap(1, BASE), blocks: [h('Cyberattacks'), ...snap(1, BASE).blocks] };
    const b = { ...a, ts: '20200102000000', blocks: [h('2024 cyberattacks'), ...a.blocks.slice(1)] };
    expect(ruleSummary(toChangeRecord(diffPages(a, b), a, b))).toBe('Renamed section "Cyberattacks" to "2024 cyberattacks" (+2 / −1 words)');
    const c = snap(2, [BASE[0]!, 'Version 1.44.1 is the latest stable release.', ...BASE.slice(1)]);
    const d = snap(3, [BASE[0]!, 'Version 1.69.0 is the latest stable release.', ...BASE.slice(1)]);
    expect(ruleSummary(toChangeRecord(diffPages(c, d), c, d))).toBe('Updated version 1.44.1 to 1.69.0; reworded 1 passage (+1 / −1 words)');
    const e = { ...snap(4, BASE), title: 'Rust Programming Language', blocks: [h('Rust'), h('Why Rust?'), ...BASE.map((text) => ({ kind: 'paragraph' as const, text }))] };
    expect(ruleSummary(toChangeRecord(diffPages(snap(1, BASE), e), snap(1, BASE), e))).toMatch(/^Title changed to .*; added 2 sections incl\. "Why Rust\?"/);
  });

  it('names a rename only between two headings that read as titles (Wikipedia, first capture to the latest)', () => {
    // Real fixture data: the 2018 page's paragraph "40" pairs with the 2026 heading "2024 cyberattacks" (their word
    // sets match once digits fold), which read as `Renamed section "40" to "2024 cyberattacks"`.
    const s = fixtureToSnapshots(samples[0]!);
    const [a, b] = [s.find((x) => x.ts === '20180425033645')!, s.find((x) => x.ts === '20260210204802')!];
    const r = toChangeRecord(diffPages(a, b), a, b);
    expect(r.headingsRenamed ?? []).toEqual([]);
    expect(r.headingsAdded).toContain('2024 cyberattacks');
    expect(ruleSummary(r)).toBe('Added section "2024 cyberattacks"; removed 3 sections incl. "Web archiving" (+913 / −963 words)');
    // Minimal: a bare number, a date or a count on either side of a reworded heading is not a section name.
    const h = (text: string) => ({ kind: 'heading' as const, text, level: 2 as const });
    const page = (n: number, head: string) => ({ ...snap(n, BASE), blocks: [h(head), ...snap(n, BASE).blocks] });
    for (const [x, y] of [['40', '2024 cyberattacks'], ['12 May 2024', 'May 2024 news'], ['1,204', '1,204 downloads']] as const) {
      const [c, d] = [page(1, x), page(2, y)];
      const rec = toChangeRecord(diffPages(c, d), c, d);
      expect(rec.headingsRenamed ?? []).toEqual([]);
      expect(ruleSummary(rec)).toMatch(new RegExp(`^Added section "${y}"`));
    }
  });

  it('counts bare-year headings as sections added or removed, and a year heading changing as one gone and one new', () => {
    const h = (text: string) => ({ kind: 'heading' as const, text, level: 2 as const });
    const base = snap(1, BASE);
    const added = { ...snap(2, BASE), blocks: [h('2025'), ...base.blocks] };
    expect(toChangeRecord(diffPages(base, added), base, added).headingsAdded).toEqual(['2025']);
    expect(ruleSummary(toChangeRecord(diffPages(added, base), added, base))).toMatch(/^Removed section "2025"/);
    const [c, d] = [{ ...snap(1, BASE), blocks: [h('2023'), ...base.blocks] }, { ...snap(2, BASE), blocks: [h('2024'), ...base.blocks] }];
    const r = toChangeRecord(diffPages(c, d), c, d);
    expect([r.headingsRenamed ?? [], r.headingsAdded, r.headingsRemoved]).toEqual([[], ['2024'], ['2023']]);
    expect(ruleSummary(r)).toBe('Added section "2024"; removed section "2023" (+1 / −1 words)');
  });

  it('stays within budget for long names, and falls back for moves only', () => {
    const stats = { wordsAdded: 12345, wordsRemoved: 6789, blocksAdded: 3, blocksRemoved: 1, blocksModified: 0 };
    const r: ChangeRecord = { pair: 'p', title: 'x'.repeat(100), titleChanged: true, headingsAdded: ['y'.repeat(80), 'z'], headingsRemoved: ['w'.repeat(80)], added: [], removed: [], modified: [], stats };
    expect(ruleSummary(r).length).toBeLessThanOrEqual(MAX_RULE_SUMMARY_CHARS);
    expect(ruleSummary({ ...r, titleChanged: undefined, headingsAdded: [], headingsRemoved: [], stats: { ...stats, wordsAdded: 0, wordsRemoved: 0, blocksAdded: 0, blocksRemoved: 0 } })).toBe('Moved content around');
  });
});

describe('buildTimeline', () => {
  it('moving baseline: 5 tiny edits, each trivial, surface together as one meaningful change', () => {
    // Page sized so four 1-word edits stay below the minor threshold and five reach it.
    const paragraphs = Math.round(4.5 / (2 * MAGNITUDE_THRESHOLDS.minor ** 2) / 12);
    const texts = Array.from({ length: paragraphs }, (_, i) => `Paragraph ${i} has eleven plain words about the river and its birds.`);
    const caps = [snap(1, texts)];
    for (let n = 0; n < 5; n++) {
      texts[n * 2] = texts[n * 2]!.replace('birds', 'herons');
      caps.push(snap(n + 2, [...texts]));
    }
    const pairwise = caps.slice(1).map((b, i) => buildTimeline('u', [caps[i]!, b]).entries.length);
    expect(pairwise).toEqual([0, 0, 0, 0, 0]);
    const t = buildTimeline('u', caps);
    expect(t.entries.map((e) => [e.from, e.to])).toEqual([[caps[0]!.ts, caps[5]!.ts]]);
    expect(t.trivialCaptures).toEqual([caps[1]!.ts, caps[2]!.ts, caps[3]!.ts, caps[4]!.ts]);
    expect(t.entries[0]!.significance.magnitude).toBe('minor');
    // Each trivial capture is diffed against the baseline it was compared with (the first capture).
    const trivial = trivialEntries(t);
    expect(trivial.map((e) => [e.from, e.to])).toEqual(t.trivialCaptures.map((ts) => [caps[0]!.ts, ts]));
    expect(trivial.every((e) => e.significance.magnitude === 'trivial' && e.ruleSummary)).toBe(true);
  });

  it('equals incremental appendSnapshot, and rejects out-of-order captures', () => {
    for (const f of samples) {
      const s = fixtureToSnapshots(f);
      expect(s.reduce((t, x) => appendSnapshot(t, x), emptyTimeline(f.url))).toEqual(buildTimeline(f.url, [...s].reverse()));
      expect(() => appendSnapshot(buildTimeline(f.url, s), s[0]!)).toThrow(RangeError);
    }
  });

  it('each committed sample yields 4-15 meaningful changes', () => {
    const counts = Object.fromEntries(samples.map((f) => [f.id, buildTimeline(f.url, fixtureToSnapshots(f)).entries.length]));
    expect(Object.values(counts).every((n) => n >= 4 && n <= 15)).toBe(true);
    expect(counts).toEqual({ 'wikipedia-internet-archive': 13, 'git-scm': 9, 'rust-lang': 5 }); // recorded in phase 6
  });
});
