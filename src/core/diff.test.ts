import { describe, expect, it } from 'vitest';
import git from '../samples/git-scm.json';
import rust from '../samples/rust-lang.json';
import wiki from '../samples/wikipedia-internet-archive.json';
import { applyDiff, diffPages, diffWords, tokenizeWords } from './diff.ts';
import { fixtureToSnapshots, parseSampleFixture } from './fixture.ts';
import { myersDiff } from './myers.ts';
import type { Block, ExtractedPage, PageDiff } from './types.ts';

const p = (...texts: string[]): ExtractedPage => ({ title: 'T', blocks: texts.map((text) => ({ kind: 'paragraph', text })) });
const types = (d: PageDiff) => d.ops.map((o) => o.type);

/** Reconstruction property, both directions: B from A + ops, and A's text back from word ops. */
function expectRoundTrip(a: ExtractedPage, b: ExtractedPage): PageDiff {
  const d = diffPages(a, b);
  expect(applyDiff(a.blocks, d)).toEqual(b.blocks);
  const mods = d.ops.flatMap((op) => (op.type === 'modified' ? [op] : []));
  expect(mods.map((op) => op.words.filter((w) => w.type !== 'ins').map((w) => w.from ?? w.text).join(''))).toEqual(mods.map((op) => a.blocks[op.a]!.text));
  const removedOrKept = d.ops.flatMap((o) => (o.type === 'added' ? [] : [o.a])).sort((x, y) => x - y);
  expect(removedOrKept).toEqual(a.blocks.map((_, i) => i));
  return d;
}

/** Deterministic pseudo-random words; `mutate` drops, rewords, inserts and moves blocks. */
const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const WORDS = 'archive page history web snapshot text change open source library garden river'.split(' ');
const word = (r: () => number) => WORDS[Math.floor(r() * WORDS.length)]!;
const randomPage = (r: () => number, len: number) => p(...Array.from({ length: len }, (_, i) => `${word(r)} block ${i % 7} ${word(r)}`));
function mutate(r: () => number, page: ExtractedPage, rate: number): ExtractedPage {
  const blocks = page.blocks.flatMap((b): Block[] => {
    const x = r() / rate;
    return x < 0.25 ? [] : x < 0.5 ? [{ ...b, text: `${b.text} more ${word(r)}` }] : x < 0.75 ? [b, { kind: 'list-item', text: `new ${word(r)} ${x}` }] : [b];
  });
  if (blocks.length > 2 && r() < rate) blocks.push(...blocks.splice(1, 1));
  return { title: page.title, blocks };
}

describe('myersDiff', () => {
  it.each([['', ''], ['abc', ''], ['', 'abc'], ['abcabba', 'cbabac'], ['kitten', 'sitting']])('%j -> %j is a minimal, valid script', (a, b) => {
    const s = myersDiff([...a], [...b])!;
    expect(s.filter((o) => o !== 'equal').length).toBe({ abcabba: 5, kitten: 5 }[a] ?? a.length + b.length);
    expect(s.filter((o) => o !== 'ins').length).toBe(a.length);
    expect(s.filter((o) => o !== 'del').length).toBe(b.length);
  });

  it('returns null past maxEditDistance', () => {
    expect(myersDiff([...'abcd'], [...'wxyz'], 7)).toBeNull();
    expect(myersDiff([...'abcd'], [...'wxyz'], 8)).not.toBeNull();
  });
});

describe('tokenizeWords', () => {
  it.each([
    ['Hello, big world. ', ['Hello, ', 'big ', 'world. ']],
    ['  lead "quoted" (x)', ['  ', 'lead ', '"quoted" ', '(x)']],
    ['互联网档案馆 is 2 words', ['互', '联', '网', '档', '案', '馆 ', 'is ', '2 ', 'words']],
    ['カタカナ。ok', ['カ', 'タ', 'カ', 'ナ', '。ok']],
  ])('%j', (text, tokens) => {
    expect(tokenizeWords(text)).toEqual(tokens);
    expect(tokenizeWords(text).join('')).toBe(text);
  });
});

describe('diffPages', () => {
  const samples = [wiki, git, rust].map((f) => fixtureToSnapshots(parseSampleFixture(f)));
  it.each(samples.map((s, i) => [['wikipedia', 'git-scm', 'rust-lang'][i], s] as const))('%s: every consecutive pair round-trips', (_, snaps) => {
    for (let i = 1; i < snaps.length; i++) expect(expectRoundTrip(snaps[i - 1]!, snaps[i]!).cutoff).toBe(false);
  });

  it('round-trips synthetic random edits deterministically', () => {
    const r = rng(7);
    const seen = new Set<string>();
    for (let n = 0; n < 60; n++) {
      const a = randomPage(r, Math.floor(r() * 30));
      const b = mutate(r, a, r());
      expect(diffPages(a, b)).toEqual(expectRoundTrip(a, b));
      for (const t of types(diffPages(a, b))) seen.add(t);
    }
    expect([...seen].sort()).toEqual(['added', 'equal', 'modified', 'moved', 'removed']);
  });

  it('pairs a reworded paragraph into modified with word ops', () => {
    const d = expectRoundTrip(p('Intro.', 'The archive stores old web pages for everyone.', 'End.'), p('Intro.', 'The archive keeps old web pages for everyone, free.', 'End.'));
    expect(types(d)).toEqual(['equal', 'modified', 'equal']);
    expect(d.ops[1]).toMatchObject({ normalizedEqual: false, words: [{ type: 'equal', text: 'The archive ' }, { type: 'del', text: 'stores ' }, { type: 'ins', text: 'keeps ' }, { type: 'equal', text: 'old web pages for ' }, { type: 'del', text: 'everyone.' }, { type: 'ins', text: 'everyone, free.' }] });
  });

  it('pairs number-only edits; keeps unrelated replacements as removed + added', () => {
    expect(types(expectRoundTrip(p('Version 1.44.1'), p('Version 1.53.0')))).toEqual(['modified']);
    expect(types(expectRoundTrip(p('A.', 'Cats sleep all day long.', 'Z.'), p('A.', 'Rivers flow into the sea.', 'Z.')))).toEqual(['equal', 'removed', 'added', 'equal']);
  });

  it('detects a moved paragraph', () => {
    const d = expectRoundTrip(p('One.', 'Two.', 'Three.', 'Moving paragraph here.'), p('Moving paragraph here.', 'One.', 'Two.', 'Three.'));
    expect(d.ops).toContainEqual({ type: 'moved', a: 3, b: 0 });
    expect(types(d).filter((t) => t !== 'equal')).toEqual(['moved']);
  });

  it('marks masked-only edits as normalizedEqual and displays the original text', () => {
    const d = expectRoundTrip(p('Last updated 17 March 2014.', 'Body.'), p('Last updated 2 June 2019.', 'Body.'));
    expect(d.ops[0]).toMatchObject({ type: 'modified', normalizedEqual: true });
    expect(diffWords('Seen 17 March 2014', 'Seen 2 June 2019').map((w) => w.text).join('')).toBe('Seen 17 March 20142 June 2019');
  });

  it('reports title changes', () => {
    expect(diffPages(p('x'), { ...p('x'), title: 'U' }).titleChanged).toBe(true);
    expect(diffPages(p('x'), { ...p('x'), title: ' T ' }).titleChanged).toBe(false);
  });

  const r = rng(42);
  const big = randomPage(r, 2000);
  const lines = (tag: string) => p(...Array.from({ length: 2000 }, (_, i) => `${tag} ${i}`));
  it.each([
    ['two 2,000-block pages diff in < 100 ms', big, mutate(r, big, 0.1), false, 100],
    ['a pathological diff hits the cutoff and degrades to block replacement in < 200 ms', lines('left'), lines('right'), true, 200],
  ] as const)('%s', (label, a, b, cutoff, budgetMs) => {
    const t0 = performance.now();
    const d = diffPages(a, b);
    const ms = performance.now() - t0;
    console.info(`${label}: ${ms.toFixed(1)} ms, ${d.ops.length} ops`);
    expect([d.cutoff, applyDiff(a.blocks, d)]).toEqual([cutoff, b.blocks]);
    expect(ms).toBeLessThan(budgetMs);
  });
});
