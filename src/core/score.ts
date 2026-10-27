import { diffWords, tokenizeWords } from './diff.ts';
import { normalizeForCompare } from './normalize.ts';
import type { ExtractedPage, Magnitude, PageDiff, Significance, WordOp } from './types.ts';

/** Per-word weights. `cosmetic` covers case-only and version-number-only edits ("2.1.0" -> "2.2.0"). */
export const WEIGHTS = { heading: 3, title: 3, word: 1, cosmetic: 0.2, move: 0.1 } as const;
/** Lowest score of each magnitude; below `minor` a change is trivial. Tuned on `src/core/__eval__`. */
export const MAGNITUDE_THRESHOLDS = { minor: 0.07, moderate: 0.3, major: 0.7 } as const;
/** The page-size denominator is clamped: one word on a tiny page is not major, and a new paragraph on a long page still counts. */
const PAGE_WORDS = { min: 50, max: 1500 } as const;
const MASK = /⟨\w+⟩/g;

/** Number of words in `text` (CJK counts per character). */
export const countWords = (text: string): number => tokenizeWords(text).filter((t) => t.trim()).length;
/** Words that are not mask tokens such as `⟨date⟩`. */
const unmasked = (masked: string) => countWords(masked.replace(MASK, ' '));
/** Words left after {@link normalizeForCompare} masking: dates, times, counters and the like count 0. */
const realWords = (text: string) => unmasked(normalizeForCompare(text));

/** Weighted size of the edits in a diff of masked texts: each del/ins hunk counts its larger side. */
function editWeight(words: WordOp[]): number {
  let [del, ins, total] = ['', '', 0];
  const digits = (s: string) => s.replace(/\d+/g, '0');
  for (const op of [...words, { type: 'equal', text: '' } as const]) {
    if (op.type === 'del') del += op.text;
    else if (op.type === 'ins') ins += op.text;
    else if (del || ins) {
      const cosmetic = del.toLowerCase() === ins.toLowerCase() || (digits(del) === digits(ins) && /\d\.\d/.test(del));
      total += Math.max(unmasked(del), unmasked(ins)) * (cosmetic ? WEIGHTS.cosmetic : WEIGHTS.word);
      [del, ins] = ['', ''];
    }
  }
  return total;
}

/** Word diff of the masked texts, so only real edits remain. */
const maskedEdit = (a: string, b: string) => editWeight(diffWords(normalizeForCompare(a), normalizeForCompare(b)));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Scores a diff from page `a` to page `b`. Weighted changed words (headings and title 3x,
 * added/removed blocks and word edits 1x, case-only and version-number edits 0.2x, moves
 * 0.1x, masked noise 0) are divided by the page size (clamped to 50..1,500 words);
 * a full replacement counts both sides, so `score` is sqrt(ratio / 2), capped at 1. Below
 * {@link MAGNITUDE_THRESHOLDS}`.minor`, or when only masked tokens changed, the change is
 * `trivial`.
 */
export function scoreDiff(diff: PageDiff, a: ExtractedPage, b: ExtractedPage): Significance {
  let weighted = diff.titleChanged ? WEIGHTS.title * maskedEdit(a.title, b.title) : 0;
  const n = { added: 0, removed: 0, modified: 0, moved: 0, headings: 0 };
  for (const op of diff.ops) {
    if (op.type === 'equal' || (op.type === 'modified' && op.normalizedEqual)) continue;
    const block = op.type === 'added' ? op.block : op.type === 'removed' ? a.blocks[op.a]! : b.blocks[op.b]!;
    const k = block.kind === 'heading' ? WEIGHTS.heading : WEIGHTS.word;
    n[op.type]++;
    if (block.kind === 'heading' && op.type !== 'moved') n.headings++;
    if (op.type === 'moved') weighted += WEIGHTS.move * realWords(block.text);
    else if (op.type === 'modified') weighted += k * maskedEdit(a.blocks[op.a]!.text, block.text);
    else weighted += k * realWords(block.text);
  }
  const words = (p: ExtractedPage) => p.blocks.reduce((sum, x) => sum + realWords(x.text), 0);
  const size = Math.min(PAGE_WORDS.max, Math.max(PAGE_WORDS.min, words(a), words(b)));
  const score = Math.round(Math.min(1, Math.sqrt(weighted / size / 2)) * 1000) / 1000;
  const t = MAGNITUDE_THRESHOLDS;
  const magnitude: Magnitude = score >= t.major ? 'major' : score >= t.moderate ? 'moderate' : score >= t.minor && weighted > 0 ? 'minor' : 'trivial';
  const reasons = [
    diff.titleChanged && 'title changed',
    n.headings > 0 && `${plural(n.headings, 'heading')} changed`,
    n.added + n.removed + n.modified > 0 && `blocks +${n.added} −${n.removed} ~${n.modified}`,
    n.moved > 0 && `${n.moved} moved`,
    `${Math.round(weighted * 10) / 10} weighted words of ${size}`,
    weighted === 0 ? 'only masked noise changed (dates, counters, tracking)' : magnitude === 'trivial' && 'below threshold',
  ];
  return { score, magnitude, reasons: reasons.filter((r): r is string => typeof r === 'string') };
}
