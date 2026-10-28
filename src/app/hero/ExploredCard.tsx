import type { MouseEvent } from 'react';
import { displayAddress, hostOf } from '../../samples/index.ts';
import type { GalleryEntry } from '../live/api.ts';
import { formatUrlState } from '../urlState.ts';

/** `2009 to 2026`, or one year. */
export const years = (first: string, last: string) => (first.slice(0, 4) === last.slice(0, 4) ? first.slice(0, 4) : `${first.slice(0, 4)} to ${last.slice(0, 4)}`);

/** A plain click opens the page here; a modified click (new tab, new window) follows the link. */
const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** The index of the largest change: the highest score, the latest of a tie (the most recent redesign). */
export function largest(changes: readonly (readonly [number, number])[]): number {
  return changes.reduce((top, [, much], i) => (much >= (changes[top]?.[1] ?? -1) ? i : top), -1);
}

/**
 * The page's years as a ticket: the first, a hairline with a dot at each meaningful change's date (the largest bigger
 * and darker), the last. Quieter than the title above it; decorative, so the card's hidden text says the same.
 */
export function Ticket({ first, last, changes }: { first: string; last: string; changes: readonly (readonly [number, number])[] }) {
  const top = largest(changes);
  return (
    <span className="g-ticket" aria-hidden="true">
      <span className="mono">{first}</span>
      <span className="g-line">
        {changes.map(([where], i) => (
          <i key={i} className={i === top ? 'g-dot is-top' : 'g-dot'} style={{ left: `${where / 10}%` }} />
        ))}
      </span>
      <span className="mono">{last}</span>
    </span>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One page in Recently explored: its title first, its address, then its years as a ticket with a dot per change;
 * opens a live run.
 */
export function ExploredCard({ entry, onUrl }: { entry: GalleryEntry; onUrl: (url: string) => void }) {
  const e = entry;
  return (
    <a
      className="g-card"
      href={formatUrlState({ url: e.url }) || '/'}
      onClick={(ev) => {
        if (!plainClick(ev)) return;
        ev.preventDefault();
        onUrl(e.url);
      }}
    >
      <span className="g-title">{e.title || hostOf(e.url)}</span>
      <span className="g-addr">{displayAddress(e.url)}</span>
      <Ticket first={e.firstTs.slice(0, 4)} last={e.lastTs.slice(0, 4)} changes={e.changes ?? []} />
      <span className="sr-only">
        {years(e.firstTs, e.lastTs)}, {e.changes ? plural(e.changes.length, 'change') : plural(e.captures, 'capture')}
      </span>
    </a>
  );
}
