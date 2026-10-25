import { formatTimestampLong, formatTimestampMonth, formatTimestampShort, timestampToIso } from '../core/timestamp.ts';

/** A capture time: `17 Mar 2014` (or `Mar 2014` with `month`) on screen, the long date for screen readers. */
export const Ts = ({ ts, month = false }: { ts: string; month?: boolean }) => (
  <time className="mono" dateTime={timestampToIso(ts)}>
    <span aria-hidden="true">{month ? formatTimestampMonth(ts) : formatTimestampShort(ts)}</span>
    <span className="sr-only">{formatTimestampLong(ts)}</span>
  </time>
);
