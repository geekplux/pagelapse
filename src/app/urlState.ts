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

/** Index of the entry whose `<from>-<to>` pair is `change`; the latest entry when missing or unknown (-1 if none). */
export function changeIndex(entries: readonly { from: string; to: string }[], change?: string): number {
  const i = change ? entries.findIndex((e) => `${e.from}-${e.to}` === change) : -1;
  return i >= 0 ? i : entries.length - 1;
}

/** Replaces the current history entry's query (no new history entries while scrubbing). */
export function writeUrlState(state: UrlState): void {
  history.replaceState(history.state, '', `${location.pathname}${formatUrlState(state)}${location.hash}`);
}
