const TS_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

function parts(ts: string): number[] | null {
  const m = TS_RE.exec(ts);
  return m ? m.slice(1).map(Number) : null;
}

/** True if `ts` is a real 14-digit UTC timestamp (`YYYYMMDDhhmmss`). */
export function isValidTimestamp(ts: string): boolean {
  const p = parts(ts);
  if (!p) return false;
  const [y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0] = p;
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s
  );
}

/** Converts a valid 14-digit timestamp to an ISO 8601 UTC string. */
export function timestampToIso(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Compact display date, e.g. `17 Mar 2014`. */
export function formatTimestampShort(ts: string): string {
  return `${Number(ts.slice(6, 8))} ${MONTHS[Number(ts.slice(4, 6)) - 1]} ${ts.slice(0, 4)}`;
}

/** Month and year, e.g. `Mar 2014`. */
export function formatTimestampMonth(ts: string): string {
  return `${MONTHS[Number(ts.slice(4, 6)) - 1]} ${ts.slice(0, 4)}`;
}

/** Full, screen-reader friendly date, e.g. `17 March 2014`. */
export function formatTimestampLong(ts: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestampToIso(ts)));
}
