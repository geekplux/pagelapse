/**
 * The shareable view state: `?sample=<id>` or `?url=<page>` (a live run), then `&change=<from>-<to>&at=<ts>&view=<mode>` (`at`: the capture shown in Single
 * mode, when not the change's After; `view`: the compare mode, when not Slider).
 */
export interface UrlState {
  sample?: string | undefined;
  url?: string | undefined;
  change?: string | undefined;
  at?: string | undefined;
  view?: string | undefined;
}

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  return { sample: p.get('sample') ?? undefined, url: p.get('url') ?? undefined, change: p.get('change') ?? undefined, at: p.get('at') ?? undefined, view: p.get('view') ?? undefined };
}

export function formatUrlState({ sample, url, change, at, view }: UrlState): string {
  const p = new URLSearchParams();
  if (sample) p.set('sample', sample);
  if (url) p.set('url', url);
  if (change) p.set('change', change);
  if (at) p.set('at', at);
  if (view) p.set('view', view);
  const q = p.toString();
  return q ? `?${q}` : '';
}

/** Index of the entry whose `<from>-<to>` pair is `change`, or the one that now ends at its After; else the latest (-1 if none). */
export function changeIndex(entries: readonly { from: string; to: string }[], change?: string): number {
  if (!change) return entries.length - 1;
  const i = entries.findIndex((e) => `${e.from}-${e.to}` === change);
  if (i >= 0) return i;
  // A change since split in two (a live run fetched a capture between its ends): the part ending at its After, so the
  // selection stays on the same stretch of time.
  const to = change.split('-')[1] ?? '';
  const j = entries.findIndex((e) => e.from < to && e.to >= to);
  return j >= 0 ? j : entries.length - 1;
}

/** The hero shows when the address names no sample and no page; anything else opens the workspace. */
export const isHeroState = (s: UrlState): boolean => !s.sample && !s.url;

/** Adds a history entry (leaving the hero for the workspace), so Back returns to the hero. */
export function pushUrlState(state: UrlState): void {
  history.pushState(null, '', `${location.pathname}${formatUrlState(state)}`);
}

/** Replaces the current history entry's query (no new history entries while scrubbing). */
export function writeUrlState(state: UrlState): void {
  history.replaceState(history.state, '', `${location.pathname}${formatUrlState(state)}${location.hash}`);
}
