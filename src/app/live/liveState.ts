// Pure state of a live run: captures are fetched first and latest first, then ever finer (fetchOrder), and the
// timeline is rebuilt in time order from whatever has arrived.
import { buildTimeline, emptyTimeline } from '../../core/timeline.ts';
import type { Capture, SnapshotPage, Timeline, TimelineEntry } from '../../core/types.ts';
import type { ApiError } from './api.ts';

export type LiveStatus = 'captures' | 'snapshots' | 'done' | 'cancelled' | 'error';

/** A run that will add no more changes: finished, cancelled, or failed. */
export const runEnded = (status: LiveStatus) => status === 'done' || status === 'cancelled' || status === 'error';

/**
 * The order to fetch `n` captures (indices, oldest first = 0): the first and the latest, so the decade compare shows
 * after one round, then the middle of each gap, coarse to fine, so the timeline fills in evenly across the years.
 */
export function fetchOrder(n: number): number[] {
  const order = n > 1 ? [0, n - 1] : n === 1 ? [0] : [];
  let gaps: [number, number][] = n > 2 ? [[0, n - 1]] : [];
  while (gaps.length) {
    const finer: [number, number][] = [];
    for (const [a, b] of gaps) {
      if (b - a < 2) continue;
      const m = Math.floor((a + b) / 2);
      order.push(m);
      finer.push([a, m], [m, b]);
    }
    gaps = finer;
  }
  return order;
}

/** New changes worth an AI summaries request mid-run (a run that has ended asks for whatever is pending). */
export const SUMMARY_EVERY = 4;

/** Whether `pending` changes not yet asked for should be sent now: every {@link SUMMARY_EVERY}, and all once ended. */
export const summariesDue = (pending: number, status: LiveStatus) => pending > 0 && (runEnded(status) || pending >= SUMMARY_EVERY);

export interface LiveState {
  url: string;
  status: LiveStatus;
  /** The sampled captures, oldest first. */
  captures: Capture[];
  /** Fetched pages (`null`: failed, `undefined`: still to come) by capture index. */
  results: (SnapshotPage | null | undefined)[];
  /** How many captures have arrived (fetched or failed), in any order. */
  arrived: number;
  /** Every fetched capture, in time order. A capture arriving between two others splits their change in two. */
  timeline: Timeline;
  /** Captures that could not be fetched ("not fetched" thumbnails on the ribbon). */
  failed: string[];
  error?: ApiError;
  /** Comparisons made so far this run, by pair: each rebuild diffs only the pairs it has not seen. */
  compared: Map<string, TimelineEntry>;
}

export type LiveAction =
  | { type: 'captures'; captures: Capture[] }
  | { type: 'snapshot'; index: number; page: SnapshotPage | null }
  | { type: 'cancel' }
  | { type: 'error'; error: ApiError };

export const initialLive = (url: string): LiveState => ({
  url, status: 'captures', captures: [], results: [], arrived: 0, timeline: emptyTimeline(url), failed: [], compared: new Map(),
});

export function liveReducer(s: LiveState, a: LiveAction): LiveState {
  switch (a.type) {
    case 'captures':
      return { ...s, status: a.captures.length ? 'snapshots' : 'done', captures: a.captures, results: a.captures.map(() => undefined) };
    case 'snapshot': {
      if (s.status !== 'snapshots' || s.results[a.index] !== undefined) return s;
      const results = s.results.with(a.index, a.page);
      const arrived = s.arrived + 1;
      const timeline = a.page ? buildTimeline(s.url, results.filter((p) => !!p), {}, s.compared) : s.timeline;
      const failed = a.page ? s.failed : s.captures.filter((_, i) => results[i] === null).map((c) => c.ts);
      return { ...s, results, arrived, timeline, failed, status: arrived === results.length ? 'done' : s.status };
    }
    case 'cancel':
      return s.status === 'captures' || s.status === 'snapshots' ? { ...s, status: 'cancelled' } : s;
    case 'error':
      return { ...s, status: 'error', error: a.error };
  }
}

/** Shown after the progress while a run fetches; the live region announces only the part before it. */
export const KIND = 'We fetch slowly to be kind to the Internet Archive.';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The status line; the part before `KIND` is what the live region announces (`announced`). */
export function progressText(s: LiveState): string {
  const n = s.captures.length;
  const host = s.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  switch (s.status) {
    case 'captures':
      return `Looking up captures of ${host}. ${KIND}`;
    case 'snapshots':
      return `${s.arrived ? `Fetched ${s.arrived} of ${plural(n, 'capture')}` : `Fetching the first and latest of ${plural(n, 'capture')}`}, filling in the years between. ${KIND}`;
    case 'cancelled':
      return n ? `Stopped after ${s.arrived} of ${plural(n, 'capture')}.` : 'Stopped before the capture list arrived.';
    case 'error':
      return s.error?.message ?? '';
    case 'done':
      return `Done: ${plural(n, 'capture')}, ${plural(s.timeline.entries.length, 'meaningful change')}.${s.failed.length ? ` ${plural(s.failed.length, 'capture')} could not be fetched.` : ''}`;
  }
}

/** The part of a status line the live region announces: the progress without the note on fetching slowly. */
export const announced = (text: string) => text.replace(` ${KIND}`, '');

/**
 * The changes no capture still to come can split: every capture between their two ends has arrived (or the run has
 * ended, so none will). Only these are worth an AI summary; the others may yet be cut in two.
 */
export function settledEntries(s: LiveState): TimelineEntry[] {
  if (runEnded(s.status)) return s.timeline.entries;
  const index = new Map(s.captures.map((c, i) => [c.ts, i]));
  return s.timeline.entries.filter((e) => {
    const [a, b] = [index.get(e.from) ?? 0, index.get(e.to) ?? 0];
    return s.results.slice(a, b + 1).every((r) => r !== undefined);
  });
}
