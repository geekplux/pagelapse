import { countWords } from './score.ts';
import type { ChangeRecord, PageDiff, SnapshotPage, WordOp } from './types.ts';
import { pairKey } from './url.ts';

/** Upper bound of `JSON.stringify(toChangeRecord(...)).length`. */
export const MAX_RECORD_CHARS = 1200;
/** Longest snippet in a record, in characters. */
export const MAX_SNIPPET_CHARS = 160;
const LIMITS = { headings: 10, added: 5, removed: 5, modified: 3 } as const;

/** Collapses whitespace and clips `text` to `max` chars, at a word break when one is near, ending in "…". */
export function clip(text: string, max = MAX_SNIPPET_CHARS): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

/** Month and weekday names (and their short forms), ordinal suffixes and number words: dates and counts, not names. */
const NOT_A_NAME = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|st|nd|rd|th|k|m|bn|thousand|million|billion|trillion)$/;

/**
 * Whether a heading reads as a section name: it has a word that is not a number, a date part or a count unit, so
 * "40", "12 May 2024" and "1.3 million" are not names, while "2024 cyberattacks" and "Why Rust?" are.
 */
export function looksLikeTitle(text: string): boolean {
  return (text.toLowerCase().match(/\p{L}+/gu) ?? []).some((w) => !NOT_A_NAME.test(w) && (w.length > 1 || !/\p{Script=Latin}/u.test(w)));
}

/** One side of a word diff, starting a few words before its first edit so the excerpt shows the change. */
function excerpt(words: WordOp[], side: 'del' | 'ins'): string {
  let [text, at] = ['', -1];
  for (const w of words) {
    if (w.type !== 'equal' && at < 0) at = text.length;
    if (w.type === side) text += w.text;
    else if (w.type === 'equal') text += side === 'del' ? (w.from ?? w.text) : w.text;
  }
  const start = at > 40 ? text.lastIndexOf(' ', at - 40) + 1 : 0;
  return start > 0 ? `…${clip(text.slice(start), MAX_SNIPPET_CHARS - 1)}` : clip(text);
}

/** The `n` largest items, back in page order. */
const largest = <T>(items: { v: T; size: number }[], n: number): T[] =>
  items.map((x, i) => ({ ...x, i })).sort((p, q) => q.size - p.size || p.i - q.i).slice(0, n).sort((p, q) => p.i - q.i).map((x) => x.v);

/**
 * Builds the compact summariser input for the change from capture `a` to capture `b`:
 * title, headings added/removed/renamed, the largest added and
 * removed blocks, excerpts of the most-edited blocks, and word/block counts. Edits that only
 * touch masked noise are left out. Snippets are clipped to {@link MAX_SNIPPET_CHARS}, and
 * items are dropped (longest list first, headings last) until the JSON fits {@link MAX_RECORD_CHARS}.
 */
export function toChangeRecord(diff: PageDiff, a: SnapshotPage, b: SnapshotPage): ChangeRecord {
  const stats = { wordsAdded: 0, wordsRemoved: 0, blocksAdded: 0, blocksRemoved: 0, blocksModified: 0 };
  const [headingsAdded, headingsRemoved, renamed] = [[] as string[], [] as string[], [] as [string, string][]];
  const [added, removed] = [[] as { v: string; size: number }[], [] as { v: string; size: number }[]];
  const modified: { v: ChangeRecord['modified'][number]; size: number }[] = [];
  for (const op of diff.ops) {
    if (op.type === 'added' || op.type === 'removed') {
      const block = op.type === 'added' ? op.block : a.blocks[op.a]!;
      const side = op.type === 'added' ? 'Added' : 'Removed';
      const size = countWords(block.text);
      stats[`words${side}` as const] += size;
      stats[`blocks${side}` as const]++;
      if (block.kind === 'heading') {
        if (looksLikeTitle(block.text)) (side === 'Added' ? headingsAdded : headingsRemoved).push(clip(block.text, 80));
      } else (side === 'Added' ? added : removed).push({ v: clip(block.text), size });
    } else if (op.type === 'modified' && !op.normalizedEqual) {
      const side = (t: WordOp['type']) => countWords(op.words.filter((w) => w.type === t).map((w) => w.text).join(''));
      const [ins, del] = [side('ins'), side('del')];
      stats.wordsAdded += ins;
      stats.wordsRemoved += del;
      stats.blocksModified++;
      // A rename needs a section name on both sides: pairing folds digits and ignores kind, so a paragraph "40" can
      // pair with the heading "2024 cyberattacks". A name on one side only is a section added or removed.
      const [x, y] = [a.blocks[op.a]!, b.blocks[op.b]!];
      const [was, now] = [x.kind === 'heading' && looksLikeTitle(x.text), y.kind === 'heading' && looksLikeTitle(y.text)];
      if (was && now) renamed.push([clip(x.text, 80), clip(y.text, 80)]);
      else if (was || now) (was ? headingsRemoved : headingsAdded).push(clip((was ? x : y).text, 80));
      else if (op.kind !== 'heading') modified.push({ v: { before: excerpt(op.words, 'del'), after: excerpt(op.words, 'ins') }, size: ins + del });
    }
  }
  const record: ChangeRecord = {
    pair: pairKey(a.ts, b.ts),
    title: clip(b.title, 100),
    ...(diff.titleChanged ? { titleChanged: true as const } : {}),
    headingsAdded: headingsAdded.slice(0, LIMITS.headings),
    headingsRemoved: headingsRemoved.slice(0, LIMITS.headings),
    ...(renamed.length ? { headingsRenamed: renamed.slice(0, LIMITS.headings) } : {}),
    added: largest(added, LIMITS.added),
    removed: largest(removed, LIMITS.removed),
    modified: largest(modified, LIMITS.modified),
    stats,
  };
  const longest = (lists: unknown[][]) => lists.reduce((x, y) => (y.length > x.length ? y : x));
  while (JSON.stringify(record).length > MAX_RECORD_CHARS) {
    const body = longest([record.modified, record.removed, record.added]);
    (body.length ? body : longest([record.headingsRemoved, record.headingsAdded, record.headingsRenamed ?? []])).pop();
  }
  return record;
}
