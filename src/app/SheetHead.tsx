import type { ReactNode } from 'react';
import { formatTimestampShort } from '../core/timestamp.ts';

interface Props {
  id: string;
  /** The sample's label, or a live run's host. */
  title: string;
  /** Every capture's timestamp, oldest first. */
  captures: readonly string[];
  changes: number;
  trivial: number;
  sample?: boolean;
  /** A live run's status line, under the meta line. */
  children?: ReactNode;
}

const monthYear = (ts: string) => formatTimestampShort(ts).replace(/^\d+ /, '');
const count = (n: number, one: string, many = `${one}s`) => (
  <span>
    <b className="num">{n}</b> {n === 1 ? one : many}
  </span>
);

/** `Sep 2014 to Feb 2026`, or one month when both ends share it. */
export function spanText(captures: readonly string[]): string {
  const [a, b] = [captures[0], captures.at(-1)].map((ts) => (ts ? monthYear(ts) : ''));
  return a === b ? a! : `${a} to ${b}`;
}

/** The title block: the title, then one meta line (captures, span, changes, trivial edits hidden, the Sample tag). */
export function SheetHead({ id, title, captures, changes, trivial, sample = false, children }: Props) {
  return (
    <div className="sheet-head">
      <h2 id={id}>{title}</h2>
      {/* Always there, so a live run's line filling in does not move the stage. */}
      <p className="sheet-meta">
        {captures.length > 0 && (
          <>
            {count(captures.length, 'capture')}
            <span>{spanText(captures)}</span>
            {count(changes, 'change')}
            {trivial > 0 && count(trivial, 'trivial edit hidden', 'trivial edits hidden')}
          </>
        )}
        {sample && <span className="tag">Sample</span>}
      </p>
      {children}
    </div>
  );
}
