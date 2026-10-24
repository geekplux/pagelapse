import type { ReactNode, Ref } from 'react';
import { formatTimestampMonth as monthYear } from '../core/timestamp.ts';

interface Props {
  id: string;
  /** The sample's label, or a live run's host. */
  title: string;
  /** Every capture's timestamp, oldest first. */
  captures: readonly string[];
  changes: number;
  trivial: number;
  /** Live runs: captures that could not be fetched. */
  failed?: number;
  sample?: boolean;
  /**
   * A live run's status line. It shares one box with the meta line: both are always laid out, and the one not shown
   * is hidden, so the box keeps its height when a run ends and the line turns into the meta line.
   */
  status?: ReactNode;
  /** The status line shows (a run fetching or stopped); otherwise the meta line does. */
  statusShown?: boolean;
  /** The meta line, focusable from script (a live run moves focus here when it ends and takes Cancel with it). */
  metaRef?: Ref<HTMLParagraphElement> | undefined;
}

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
export function SheetHead({ id, title, captures, changes, trivial, failed = 0, sample = false, status, statusShown = false, metaRef }: Props) {
  const meta = (
    // Always there, so a live run's line filling in does not move the stage.
    <p className="sheet-meta" aria-hidden={statusShown || undefined} tabIndex={metaRef ? -1 : undefined} ref={metaRef}>
      {captures.length > 0 && (
        <>
          {count(captures.length, 'capture')}
          <span>{spanText(captures)}</span>
          {count(changes, 'change')}
          {trivial > 0 && count(trivial, 'trivial edit hidden', 'trivial edits hidden')}
          {failed > 0 && count(failed, 'capture not fetched', 'captures not fetched')}
        </>
      )}
      {sample && <span className="tag">Sample</span>}
    </p>
  );
  return (
    <div className="sheet-head">
      <h2 id={id}>{title}</h2>
      {status === undefined ? (
        meta
      ) : (
        <div className="sheet-meta-box">
          {meta}
          {status}
        </div>
      )}
    </div>
  );
}
