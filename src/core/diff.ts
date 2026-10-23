import { myersDiff } from './myers.ts';
import { foldText, normalizeForCompare } from './normalize.ts';
import type { Block, BlockOp, ExtractedPage, PageDiff, WordOp } from './types.ts';

/** Default edit-distance cutoff for {@link diffPages} and {@link diffWords}. */
export const DEFAULT_MAX_EDIT_DISTANCE = 1000;
/** Word-set Jaccard similarity at or above which a removed+added block pair becomes `modified`. */
export const PAIR_SIMILARITY = 0.5;
/** How many added blocks ahead a removed block may look for its reworded partner. */
const PAIR_WINDOW = 8;

const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}`;
const TOKEN = new RegExp(String.raw`[${CJK}]\s*|[^\s${CJK}]+\s*|\s+`, 'gu');

/**
 * Splits text into word tokens that keep trailing whitespace and attached punctuation
 * ("fast, " is one token), with one token per CJK character. Joining the tokens gives
 * back the input exactly.
 */
export function tokenizeWords(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

const intern = (keys: Map<string, number>, list: string[]) =>
  list.map((k) => keys.get(k) ?? (keys.set(k, keys.size), keys.size - 1));

function pushWord(out: WordOp[], type: WordOp['type'], text: string, from = text): void {
  if (!text && !from) return;
  const last = out[out.length - 1];
  const op: WordOp = last?.type === type ? last : { type, text: '' };
  if (from !== text || op.from !== undefined) op.from = (op.from ?? op.text) + from;
  op.text += text;
  if (op !== last) out.push(op);
}

/**
 * Word-level diff of two texts; tokens compare after {@link foldText}. Adjacent ops of
 * the same type are merged. Past `maxEditDistance` it returns one `del` and one `ins`.
 */
export function diffWords(a: string, b: string, maxEditDistance = DEFAULT_MAX_EDIT_DISTANCE): WordOp[] {
  const [ta, tb] = [tokenizeWords(a), tokenizeWords(b)];
  const keys = new Map<string, number>();
  const script = myersDiff(intern(keys, ta.map(foldText)), intern(keys, tb.map(foldText)), maxEditDistance);
  const out: WordOp[] = [];
  if (!script) return out.concat(a ? { type: 'del', text: a } : [], b ? { type: 'ins', text: b } : []);
  let [i, j] = [0, 0];
  for (const s of script) {
    if (s === 'del') pushWord(out, 'del', ta[i++]!);
    else if (s === 'ins') pushWord(out, 'ins', tb[j++]!);
    else pushWord(out, 'equal', tb[j++]!, ta[i++]!);
  }
  return out;
}

const exactKey = (b: Block) => `${b.kind}${b.level ?? ''}|${b.text}`;
/** Word set for pairing; digits fold so number-only edits ("Version 1.44" -> "1.53") still pair. */
const wordSet = (text: string) => new Set(tokenizeWords(normalizeForCompare(text).toLowerCase().replace(/\d+/g, '0')).map((t) => t.trim()));

function jaccard(x: Set<string>, y: Set<string>): number {
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / (x.size + y.size - common || 1);
}

/**
 * Diffs two extracted pages. Blocks align with Myers on kind + {@link normalizeForCompare}
 * keys; an aligned pair whose original text differs becomes `modified` with
 * `normalizedEqual: true`. Identical blocks removed in one place and added in another
 * become `moved`. Remaining adjacent removed+added runs are paired in order by word-set
 * Jaccard >= {@link PAIR_SIMILARITY} into `modified` blocks with word ops. Past
 * `maxEditDistance` block edits it returns a plain block replacement with `cutoff: true`.
 */
export function diffPages(a: ExtractedPage, b: ExtractedPage, opts: { maxEditDistance?: number } = {}): PageDiff {
  const max = opts.maxEditDistance ?? DEFAULT_MAX_EDIT_DISTANCE;
  const [A, B] = [a.blocks, b.blocks];
  const keys = new Map<string, number>();
  const key = (x: Block) => `${x.kind}${x.level ?? ''}|${normalizeForCompare(x.text)}`;
  const script = myersDiff(intern(keys, A.map(key)), intern(keys, B.map(key)), max);
  const titleChanged = normalizeForCompare(a.title) !== normalizeForCompare(b.title);
  const added = (j: number): BlockOp => ({ type: 'added', b: j, block: B[j]! });
  const modified = (i: number, j: number, normalizedEqual: boolean): BlockOp => {
    const { kind, level, text } = B[j]!;
    const words = diffWords(A[i]!.text, text, max);
    return { type: 'modified', a: i, b: j, kind, ...(level === undefined ? {} : { level }), words, normalizedEqual };
  };
  if (!script) return { ops: [...A.map((_, i): BlockOp => ({ type: 'removed', a: i })), ...B.map((_, j) => added(j))], titleChanged, cutoff: true };
  let [i, j] = [0, 0];
  const ops = script.map((s): BlockOp => {
    if (s === 'del') return { type: 'removed', a: i++ };
    if (s === 'ins') return added(j++);
    return exactKey(A[i]!) === exactKey(B[j]!) ? { type: 'equal', a: i++, b: j++ } : modified(i++, j++, true);
  });
  // Moves: an added block identical to a removed one elsewhere; that removed op is dropped.
  const removedBy = new Map<string, BlockOp[]>();
  for (const o of ops) if (o.type === 'removed') removedBy.set(exactKey(A[o.a]!), [...(removedBy.get(exactKey(A[o.a]!)) ?? []), o]);
  const moved = new Set<BlockOp>();
  for (const [at, op] of ops.entries()) {
    const from = op.type === 'added' ? removedBy.get(exactKey(op.block))?.shift() : undefined;
    if (op.type !== 'added' || from?.type !== 'removed') continue;
    ops[at] = { type: 'moved', a: from.a, b: op.b };
    moved.add(from);
  }
  // Pair each run of removed/added blocks into modified blocks, in order and keeping B order.
  const out: BlockOp[] = [];
  for (let k = 0; k <= ops.length; k++) {
    const run: BlockOp[] = [];
    for (; k < ops.length && (ops[k]!.type === 'removed' || ops[k]!.type === 'added'); k++) if (!moved.has(ops[k]!)) run.push(ops[k]!);
    const adds = run.flatMap((o) => (o.type === 'added' ? [o.b] : []));
    const sets = adds.map((n) => wordSet(B[n]!.text));
    let next = 0;
    for (const r of run.flatMap((o) => (o.type === 'removed' ? [o.a] : []))) {
      const rs = wordSet(A[r]!.text);
      let [best, bestSim] = [-1, PAIR_SIMILARITY];
      for (let c = next; c < Math.min(adds.length, next + PAIR_WINDOW); c++) {
        const sim = jaccard(rs, sets[c]!);
        if (sim > bestSim || (best < 0 && sim === bestSim)) [best, bestSim] = [c, sim];
      }
      if (best < 0) out.push({ type: 'removed', a: r });
      else {
        while (next < best) out.push(added(adds[next++]!));
        out.push(modified(r, adds[next++]!, false));
      }
    }
    while (next < adds.length) out.push(added(adds[next++]!));
    if (k < ops.length) out.push(ops[k]!);
  }
  return { ops: out, titleChanged, cutoff: false };
}

/** Replays a diff on page A's blocks; for any `diffPages(a, b)` this returns B's blocks. */
export function applyDiff(a: readonly Block[], diff: PageDiff): Block[] {
  return diff.ops.flatMap((op): Block[] => {
    if (op.type === 'removed') return [];
    if (op.type === 'added') return [op.block];
    if (op.type !== 'modified') return [a[op.a]!];
    const text = op.words.filter((w) => w.type !== 'del').map((w) => w.text).join('');
    return [{ kind: op.kind, text, ...(op.level === undefined ? {} : { level: op.level }) }];
  });
}
