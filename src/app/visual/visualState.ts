// Pure selection logic of the visual pane: which capture a change shows, and which change a capture belongs to.
import { formatTimestampLong } from '../../core/timestamp.ts';

/** A change as the pane sees it: its baseline (`from`) and its new capture (`to`). */
interface Pair {
  from: string;
  to: string;
}

/** Which capture of a change the pane shows: the baseline (`before`) or the new capture (`after`, the default). */
export type Side = 'before' | 'after';

export const pairOf = (e: Pair) => `${e.from}-${e.to}`;

/** The capture shown for change `e` on `side`. */
export const captureForChange = (e: Pair, side: Side) => (side === 'before' ? e.from : e.to);

/** The side of `e` that capture `at` is, or `null` when it is neither (e.g. a trivial capture in between). */
export const sideOf = (e: Pair, at: string): Side | null => (at === e.to ? 'after' : at === e.from ? 'before' : null);

/** Index of the change in effect at capture `ts`: the one ending there, else the latest one before it, else the first (-1 if none). */
export function changeForCapture(entries: readonly Pair[], ts: string): number {
  const ends = entries.findIndex((e) => e.to === ts);
  if (ends >= 0) return ends;
  const before = entries.findLastIndex((e) => e.to <= ts);
  return before >= 0 ? before : entries.length ? 0 : -1;
}

/**
 * The first view: a valid `change` wins, else the change in effect at a valid `at`, else `featured`, else the latest.
 * `at` defaults to the chosen change's After capture.
 */
export function initialView(entries: readonly Pair[], captures: readonly string[], q: { change?: string | undefined; at?: string | undefined; featured?: string | undefined }) {
  const find = (pair?: string) => (pair ? entries.findIndex((e) => pairOf(e) === pair) : -1);
  const at = q.at && captures.includes(q.at) ? q.at : undefined;
  let index = find(q.change);
  if (index < 0) index = at ? changeForCapture(entries, at) : find(q.featured);
  if (index < 0) index = entries.length - 1;
  return { index, at: at ?? entries[index]?.to ?? captures.at(-1) ?? '' };
}

/** The `change` / `at` query for a view; `at` is left out when it is the change's After capture (the default). */
export const viewQuery = (e: Pair, at: string) => ({ change: pairOf(e), at: at === e.to ? undefined : at });

/** Same-origin URL of a recorded picture (`public/samples/<id>/`), full size or thumbnail. */
export const shotSrc = (sampleId: string, file: string, thumb = false) => `/samples/${sampleId}/${file}${thumb ? '.thumb' : ''}.webp`;

/** Frame number as shown on the filmstrip, `#01`. */
export const frameNo = (i: number) => `#${String(i + 1).padStart(2, '0')}`;

const SIDE_WORD: Record<Side, string> = { before: 'Before', after: 'After' };

/**
 * What the pane shows, for the announcement after a selection: `Before, 6 November 2013`, or for a capture that is
 * neither side of change `e`, `capture #05, 6 November 2013, trivial edit`.
 */
export function showingText(captures: readonly string[], e: Pair, at: string, trivial: boolean): string {
  const side = sideOf(e, at);
  if (side) return `${SIDE_WORD[side]}, ${formatTimestampLong(at)}`;
  return `capture ${frameNo(captures.indexOf(at))}, ${formatTimestampLong(at)}${trivial ? ', trivial edit' : ''}`;
}

/** Alt text of the pane's picture: `git-scm.com home page as captured 18 December 2025 (After), top of page`. */
export const shotAlt = (label: string, e: Pair, at: string) => {
  const side = sideOf(e, at);
  return `${label} as captured ${formatTimestampLong(at)}${side ? ` (${SIDE_WORD[side]})` : ''}, top of page`;
};
