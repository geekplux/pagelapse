import { diffPages } from './diff.ts';
import { toChangeRecord } from './changeRecord.ts';
import { ruleSummary } from './ruleSummary.ts';
import { scoreDiff } from './score.ts';
import type { SnapshotPage, Timeline, TimelineEntry } from './types.ts';
import { pairKey } from './url.ts';

/** Options for {@link buildTimeline} and {@link appendSnapshot}, passed on to `diffPages`. */
export interface TimelineOptions {
  maxEditDistance?: number;
}

/** A timeline with no captures yet; grow it with {@link appendSnapshot}. */
export function emptyTimeline(url: string): Timeline {
  return { url, snapshots: [], entries: [], trivialCaptures: [], baseline: 0 };
}

/** The entry for the change from `base` to `s`, whatever its magnitude (also any two captures, e.g. first and latest). */
export function compareCaptures(base: SnapshotPage, s: SnapshotPage, opts: TimelineOptions = {}): TimelineEntry {
  const diff = diffPages(base, s, opts);
  const significance = scoreDiff(diff, base, s);
  const record = toChangeRecord(diff, base, s);
  return { from: base.ts, to: s.ts, diff, significance, record, ruleSummary: ruleSummary(record) };
}

/**
 * Returns a new timeline with capture `s` appended (the input is not mutated). `s` is diffed
 * against the baseline, the last *meaningful* capture, so slow drift through many trivial
 * captures still surfaces. A meaningful change adds an entry and becomes the new baseline; a
 * trivial one is only listed in `trivialCaptures`. Captures must arrive in time order.
 */
export function appendSnapshot(t: Timeline, s: SnapshotPage, opts: TimelineOptions = {}): Timeline {
  const last = t.snapshots.at(-1);
  if (last && s.ts <= last.ts) throw new RangeError(`appendSnapshot: capture ${s.ts} is not after ${last.ts}`);
  const snapshots = [...t.snapshots, s];
  const base = t.snapshots[t.baseline];
  if (!base) return { ...t, snapshots };
  const entry = compareCaptures(base, s, opts);
  if (entry.significance.magnitude === 'trivial') return { ...t, snapshots, trivialCaptures: [...t.trivialCaptures, s.ts] };
  return { ...t, snapshots, entries: [...t.entries, entry], baseline: snapshots.length - 1 };
}

/** Builds the timeline of `snapshots` (sorted by time first); same result as appending them one by one. */
export function buildTimeline(url: string, snapshots: readonly SnapshotPage[], opts: TimelineOptions = {}): Timeline {
  const sorted = [...snapshots].sort((x, y) => (x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : 0));
  return sorted.reduce((t, s) => appendSnapshot(t, s, opts), emptyTimeline(url));
}

/**
 * Entries (magnitude `trivial`) for the captures in `t.trivialCaptures`, each diffed against the
 * baseline it was compared with, in time order: what a "show trivial edits" view lists.
 */
export function trivialEntries(t: Timeline, opts: TimelineOptions = {}): TimelineEntry[] {
  const trivial = new Set(t.trivialCaptures);
  let base = t.snapshots[0];
  const out: TimelineEntry[] = [];
  for (const s of t.snapshots.slice(1)) {
    if (!trivial.has(s.ts)) base = s;
    else if (base) out.push(compareCaptures(base, s, opts));
  }
  return out;
}

/** `t` with the AI text of each entry whose pair is in `ai` (the rule summary stays as the fallback). */
export function withAiSummaries(t: Timeline, ai: ReadonlyMap<string, string>): Timeline {
  if (!ai.size) return t;
  return { ...t, entries: t.entries.map((e) => (ai.has(pairKey(e.from, e.to)) ? { ...e, aiSummary: ai.get(pairKey(e.from, e.to))! } : e)) };
}
