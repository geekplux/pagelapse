// Pure selection logic of the visual pane: which capture a change shows, and which change a capture belongs to.
import { formatTimestampLong } from '../../core/timestamp.ts';
import { replayFrameUrl } from '../../core/url.ts';
import type { ExtractedPage, SampleFixture, ShotRef } from '../../core/types.ts';

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

/** How the pane compares a change's two captures, in the segmented control's order. Slider is the first view (D23). */
export type Mode = 'slider' | 'side' | 'single';
export const MODES: readonly [Mode, string][] = [['slider', 'Slider'], ['side', 'Side by side'], ['single', 'Single']];
export const DEFAULT_MODE: Mode = 'slider';
/** A known mode, else undefined (the caller falls back to its default; a retired `onion` link opens Slider). */
export const parseMode = (v?: string): Mode | undefined => MODES.find(([m]) => m === v)?.[0];

/** Live runs open in Single: one archived page per selection, a compare mode on request (D24). */
export const LIVE_MODE: Mode = 'single';

/**
 * The `change` / `at` / `view` query for a view. `at` is left out when it is the change's After capture, `view` when
 * it is the default mode (`def`: Slider for samples, Single for live runs).
 */
export const viewQuery = (e: Pair, at: string, mode: Mode = DEFAULT_MODE, def: Mode = DEFAULT_MODE) => ({
  change: pairOf(e),
  at: at === e.to ? undefined : at,
  view: mode === def ? undefined : mode,
});

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
const SPLIT_KEYS: Record<string, (v: number) => number> = {
  ArrowLeft: (v) => v - 5, ArrowDown: (v) => v - 5, ArrowRight: (v) => v + 5, ArrowUp: (v) => v + 5,
  PageDown: (v) => v - 25, PageUp: (v) => v + 25, Home: () => 0, End: () => 100, Enter: () => 50,
};

/** The divider position (0-100, % of Before shown) after `key`, or `null` when the key does not move it. Enter resets to 50. */
export const splitFromKey = (key: string, v: number): number | null => (SPLIT_KEYS[key] ? clamp(SPLIT_KEYS[key](v)) : null);

/** The divider position under a pointer at `x` over a box starting at `left`, `width` wide: 1:1, to a tenth of a percent. */
export const splitFromPointer = (x: number, left: number, width: number) => (width > 0 ? Math.min(100, Math.max(0, Math.round(((x - left) / width) * 1000) / 10)) : 50);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthYear = (ts: string) => `${MONTHS[Number(ts.slice(4, 6)) - 1] ?? ''} ${ts.slice(0, 4)}`.trim();

/** The slider's `aria-valuetext`: `40% before (November 2013), 60% after (December 2025)`; same-year captures stay apart. */
export const splitText = (v: number, e: Pair) => `${Math.round(v)}% before (${monthYear(e.from)}), ${100 - Math.round(v)}% after (${monthYear(e.to)})`;

/** Same-origin URL of a recorded picture (`public/samples/<id>/`), full size or thumbnail. */
export const shotSrc = (sampleId: string, file: string, thumb = false) => `/samples/${sampleId}/${file}${thumb ? '.thumb' : ''}.webp`;

/**
 * One capture as the pane and the ribbon show it: a recorded picture (`shot`, samples), the archive's live replay in a
 * frame (`frame`, live runs, with the extracted text for its silhouette), or no picture (`none`).
 */
export interface CaptureView {
  ts: string;
  source: 'shot' | 'frame' | 'none';
  /** Picture URL (`shot`) or replay URL (`frame`). */
  src: string;
  thumb?: string;
  page?: ExtractedPage;
  status?: ShotRef['status'];
  reason?: string | undefined;
  redacted?: number | undefined;
}

/** A sample capture's recorded picture. */
export function sampleView(f: SampleFixture, ts: string): CaptureView {
  const shot = f.snapshots.find((s) => s.ts === ts)?.shot;
  if (!shot?.file) return { ts, source: 'none', src: '', reason: shot?.reason };
  return { ts, source: 'shot', src: shotSrc(f.id, shot.file), thumb: shotSrc(f.id, shot.file, true), status: shot.status, redacted: shot.redacted };
}

/** A live capture: the Internet Archive's `if_` replay, or no picture when its text could not be fetched. */
export const liveView = (url: string, ts: string, page?: ExtractedPage): CaptureView =>
  page ? { ts, source: 'frame', src: replayFrameUrl('internet-archive', ts, url), page } : { ts, source: 'none', src: '', reason: 'This capture could not be fetched.' };

/** Capture number, `#01`. */
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

/** Alt text of the pane's picture: `NASA home page as captured 15 February 2008 (After), top of page`. */
export const shotAlt = (label: string, e: Pair, at: string, what = 'top of page') => {
  const side = sideOf(e, at);
  return `${label} as captured ${formatTimestampLong(at)}${side ? ` (${SIDE_WORD[side]})` : ''}, ${what}`;
};

/**
 * The default sample's first view (the "decade" compare): the earliest capture recorded with all its styles (`ok`) and
 * the latest one, so one drag spans the whole run. `skipped` counts earlier captures passed over (no picture, or
 * `partial`), for the caption. Undefined when fewer than two captures qualify.
 */
export function overviewPair(snapshots: readonly { ts: string; shot?: ShotRef | undefined }[]): (Pair & { skipped: number }) | undefined {
  const ok = snapshots.filter((s) => s.shot?.status === 'ok' && s.shot.file);
  const [first, last] = [ok[0], ok.at(-1)];
  if (!first || !last || first === last) return undefined;
  return { from: first.ts, to: last.ts, skipped: snapshots.indexOf(first) };
}

/** The address's view of a sample: `?change=`, `?at=`, `?view=`. */
export interface OpenQuery {
  change?: string | undefined;
  at?: string | undefined;
  view?: string | undefined;
}

/** The default sample (`overview`) opens on its decade compare unless the address names a change, a capture or Single. */
export const opensOnDecade = (overview: boolean, q: OpenQuery): boolean => overview && !q.change && !q.at && parseMode(q.view) !== 'single';

/**
 * The captures whose pictures the workspace shows first, worked out without the timeline (main.tsx decodes them before
 * the first render): the decade compare's two; else in Single the capture shown; else the change's two (the featured
 * change when the address names none). A capture named alone (`?at=`) yields just that capture; the timeline decodes
 * its change's pair once it renders. Unknown values are dropped later.
 */
export function firstCaptures(f: { snapshots: readonly { ts: string; shot?: ShotRef | undefined }[]; featured?: string | undefined }, q: OpenQuery, overview: boolean): string[] {
  const decade = opensOnDecade(overview, q) ? overviewPair(f.snapshots) : undefined;
  if (decade) return [decade.from, decade.to];
  const pair = (q.change ?? (q.at ? undefined : f.featured))?.split('-') ?? [];
  if (parseMode(q.view) === 'single') return [q.at ?? pair[1] ?? f.snapshots.at(-1)?.ts].filter((ts): ts is string => !!ts);
  return q.at && !q.change ? [q.at] : pair;
}
