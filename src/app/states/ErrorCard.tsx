import { useEffect, useState } from 'react';
import type { ApiError } from '../live/api.ts';

const COPY: Partial<Record<ApiError['code'], [heading: string, cause: string]>> = {
  excluded: ['This site is not in the Archive', 'The site asked the Internet Archive not to show its captures, so there is nothing to compare.'],
  archive_rate_limited: ['The Archive asked us to slow down', 'The Internet Archive asked us to slow down.'],
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

/** A calm card for a failed live run: what happened, why, and what to do next (AC 14). */
export function ErrorCard({ error, onRetry, onSample }: { error: ApiError; onRetry: () => void; onSample: () => void }) {
  const [heading, cause] = COPY[error.code] ?? FALLBACK;
  const left = useCountdown(error.retryAfter);
  return (
    <section className="state-card" data-error={error.code} aria-labelledby="state-heading">
      <h2 id="state-heading">
        <span aria-hidden="true">⚠ </span>
        {heading}
      </h2>
      <p>
        {cause || error.message}
        {error.retryAfter !== undefined && <span className="mono">{left > 0 ? ` Try again in ${left} s.` : ' You can try again now.'}</span>}
      </p>
      <p className="state-actions">
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="btn" onClick={onSample}>
          Open a sample
        </button>
      </p>
    </section>
  );
}
