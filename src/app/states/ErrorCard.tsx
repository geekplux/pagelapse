import { useEffect, useState } from 'react';
import type { ApiError } from '../live/api.ts';

const COPY: Partial<Record<ApiError['code'], [heading: string, cause: string]>> = {
  excluded: ['This site is not in the Archive', 'The site asked the Internet Archive not to show its captures, so there is nothing to compare.'],
  archive_rate_limited: ['The Archive needs a pause', 'The Internet Archive asked us to slow down.'],
  rate_limited: ['Too many lookups at once', 'You started many new lookups in a short time.'],
  network: ['Pagelapse is unreachable', 'We could not reach the Pagelapse server. Check your connection, then try again.'],
  invalid_url: ['That address cannot be looked up', ''],
};
const FALLBACK: [string, string] = ['The Archive is not answering', 'The Internet Archive is not responding right now. Try again in a few minutes.'];

/** Seconds left from `start`, ticking once a second. */
function useCountdown(start = 0) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return left;
}

interface Props {
  error: ApiError;
  onRetry: () => void;
  onSample: () => void;
  /** Polite live region: says once that the wait is over. */
  announce?: ((text: string) => void) | undefined;
  /** The heading, which takes focus when the status line's Cancel goes away (it is focusable from script only). */
  headingRef?: ((el: HTMLElement | null) => void) | undefined;
}

/** A failed live run, in plain words: what happened, why, and what to do next (AC 14). */
export function ErrorCard({ error, onRetry, onSample, announce, headingRef }: Props) {
  const [heading, cause] = COPY[error.code] ?? FALLBACK;
  const left = useCountdown(error.retryAfter);
  const waiting = left > 0;
  // The visible countdown is not a live region (a tick a second would be noise); its end is announced once.
  const [waited] = useState(waiting);
  useEffect(() => {
    if (waited && !waiting) announce?.('You can try again now.');
  }, [waited, waiting, announce]);
  return (
    <section className="state-card" data-error={error.code} aria-labelledby="state-heading">
      <h3 id="state-heading" tabIndex={-1} ref={headingRef}>
        {heading}
      </h3>
      <p>
        {cause || error.message}
        {error.retryAfter !== undefined && <span className="mono">{waiting ? ` Try again in ${left} s.` : ' You can try again now.'}</span>}
      </p>
      <p className="state-actions">
        {/* aria-disabled, not disabled: the button stays focusable and in the reading order while the wait runs. */}
        <button type="button" className="btn" aria-disabled={waiting || undefined} onClick={waiting ? undefined : onRetry}>
          Try again
        </button>
        {/* A text link: the card's one button is its first action. */}
        <button type="button" className="btn-link" onClick={onSample}>
          Open a sample
        </button>
      </p>
    </section>
  );
}
