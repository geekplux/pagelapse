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
      if (block.kind === 'heading') (side === 'Added' ? headingsAdded : headingsRemoved).push(clip(block.text, 80));
      else (side === 'Added' ? added : removed).push({ v: clip(block.text), size });
    } else if (op.type === 'modified' && !op.normalizedEqual) {
      const side = (t: WordOp['type']) => countWords(op.words.filter((w) => w.type === t).map((w) => w.text).join(''));
      const [ins, del] = [side('ins'), side('del')];
      stats.wordsAdded += ins;
      stats.wordsRemoved += del;
      stats.blocksModified++;
      if (op.kind === 'heading') renamed.push([clip(a.blocks[op.a]!.text, 80), clip(b.blocks[op.b]!.text, 80)]);
      else modified.push({ v: { before: excerpt(op.words, 'del'), after: excerpt(op.words, 'ins') }, size: ins + del });
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
