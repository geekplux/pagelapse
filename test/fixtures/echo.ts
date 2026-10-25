// Trivial edits for tests. No built-in sample has one (every capture of Wikipedia, NASA and Creative Commons changes
// something meaningful), so tests and smoke flows that need trivial captures add "echoes": a copy of a capture one
// minute later, with the same text and picture and its own digest, which the timeline classes as a trivial edit.

/** The 14-digit timestamp one minute after `ts`. */
export function minuteAfter(ts: string): string {
  const [y, mo, d, h, mi, s] = [0, 4, 6, 8, 10, 12].map((i, k) => Number(ts.slice(i, i + (k ? 2 : 4))));
  return new Date(Date.UTC(y!, mo! - 1, d!, h!, mi! + 1, s!)).toISOString().replace(/\D/g, '').slice(0, 14);
}

/** `snapshots` (in time order) with an echo after each capture at `indexes`. */
export function withEchoes<S extends { ts: string; digest: string }>(snapshots: readonly S[], indexes: readonly number[]): S[] {
  return snapshots.flatMap((s, i) => (indexes.includes(i) ? [s, { ...s, ts: minuteAfter(s.ts), digest: `${s.digest}-echo` }] : [s]));
}
