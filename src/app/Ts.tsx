import { formatTimestampLong, formatTimestampShort, timestampToIso } from '../core/timestamp.ts';

/** A capture time: `17 Mar 2014` on screen, the long date for screen readers. */
export const Ts = ({ ts }: { ts: string }) => (
  <time className="mono" dateTime={timestampToIso(ts)}>
    <span aria-hidden="true">{formatTimestampShort(ts)}</span>
    <span className="sr-only">{formatTimestampLong(ts)}</span>
  </time>
);
