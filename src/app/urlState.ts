/** The shareable view state: `?sample=<id>&change=<from>-<to>`. */
export interface UrlState {
  sample?: string | undefined;
  change?: string | undefined;
}

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  return { sample: p.get('sample') ?? undefined, change: p.get('change') ?? undefined };
}

export function formatUrlState({ sample, change }: UrlState): string {
  const p = new URLSearchParams();
  if (sample) p.set('sample', sample);
  if (change) p.set('change', change);
  const q = p.toString();
  return q ? `?${q}` : '';
}

/** Index of the entry whose `<from>-<to>` pair is `change`; the latest entry when missing or unknown (-1 if none). */
export function changeIndex(entries: readonly { from: string; to: string }[], change?: string): number {
  const i = change ? entries.findIndex((e) => `${e.from}-${e.to}` === change) : -1;
  return i >= 0 ? i : entries.length - 1;
}

/** Replaces the current history entry's query (no new history entries while scrubbing). */
export function writeUrlState(state: UrlState): void {
  history.replaceState(history.state, '', `${location.pathname}${formatUrlState(state)}${location.hash}`);
}
