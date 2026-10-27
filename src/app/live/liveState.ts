// Pure state of a live run: captures arrive in any order, join the timeline in time order.
import { formatTimestampShort } from '../../core/timestamp.ts';
import { appendSnapshot, emptyTimeline } from '../../core/timeline.ts';
import type { Capture, SnapshotPage, Timeline } from '../../core/types.ts';
import type { ApiError } from './api.ts';

export type LiveStatus = 'captures' | 'snapshots' | 'done' | 'cancelled' | 'error';

/** A run that will add no more changes: finished, cancelled, or failed. */
export const runEnded = (status: LiveStatus) => status === 'done' || status === 'cancelled' || status === 'error';

/** New changes worth an AI summaries request mid-run (a run that has ended asks for whatever is pending). */
export const SUMMARY_EVERY = 4;

/** Whether `pending` changes not yet asked for should be sent now: every {@link SUMMARY_EVERY}, and all once ended. */
export const summariesDue = (pending: number, status: LiveStatus) => pending > 0 && (runEnded(status) || pending >= SUMMARY_EVERY);

export interface LiveState {
  url: string;
  status: LiveStatus;
  /** The sampled captures, oldest first. */
  captures: Capture[];
  /** Fetched pages (`null`: failed) by capture index, waiting for their turn to join the timeline. */
  results: (SnapshotPage | null | undefined)[];
  /** How many captures, in time order, have joined the timeline (or failed). */
  next: number;
  timeline: Timeline;
  /** Captures that could not be fetched ("not fetched" thumbnails on the ribbon). */
  failed: string[];
  error?: ApiError;
}

export type LiveAction =
  | { type: 'captures'; captures: Capture[] }
  | { type: 'snapshot'; index: number; page: SnapshotPage | null }
  | { type: 'cancel' }
  | { type: 'error'; error: ApiError };

export const initialLive = (url: string): LiveState => ({
  url, status: 'captures', captures: [], results: [], next: 0, timeline: emptyTimeline(url), failed: [],
});

export function liveReducer(s: LiveState, a: LiveAction): LiveState {
  switch (a.type) {
    case 'captures':
      return { ...s, status: a.captures.length ? 'snapshots' : 'done', captures: a.captures, results: a.captures.map(() => undefined) };
    case 'snapshot': {
      if (s.status !== 'snapshots') return s;
      const results = s.results.with(a.index, a.page);
      let { next, timeline, failed } = s;
      for (; next < results.length && results[next] !== undefined; next++) {
        const page = results[next];
        if (page) timeline = appendSnapshot(timeline, page);
        else failed = [...failed, s.captures[next]!.ts];
      }
      return { ...s, results, next, timeline, failed, status: next === results.length ? 'done' : s.status };
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
      return `Fetching capture ${s.next + 1} of ${n} (${formatTimestampShort(s.captures[s.next]!.ts)}). ${KIND}`;
    case 'cancelled':
      return n ? `Stopped after ${s.next} of ${plural(n, 'capture')}.` : 'Stopped before the capture list arrived.';
    case 'error':
      return s.error?.message ?? '';
    case 'done':
      return `Done: ${plural(n, 'capture')}, ${plural(s.timeline.entries.length, 'meaningful change')}.${s.failed.length ? ` ${plural(s.failed.length, 'capture')} could not be fetched.` : ''}`;
  }
}

/** The part of a status line the live region announces: the progress without the note on fetching slowly. */
export const announced = (text: string) => text.replace(` ${KIND}`, '');
