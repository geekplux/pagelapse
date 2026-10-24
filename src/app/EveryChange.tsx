import { barHeight } from './timeline/scale.ts';
import type { TimelineEntry } from '../core/types.ts';
import { shownSummary } from './describe.ts';
import { Ts } from './Ts.tsx';

interface Props {
  entries: readonly TimelineEntry[];
  selected: number;
  onSelect: (i: number) => void;
  /** Captures whose only edits were dates or counters, and whether they are shown as changes. */
  trivial: number;
  showTrivial: boolean;
  onTrivial: (on: boolean) => void;
}

/** In a list that mixes the two, AI lines carry a tag; one source throughout is said by the selected change's tag. */
export const mixedSources = (entries: readonly TimelineEntry[]): boolean => entries.some((e) => e.aiSummary) && entries.some((e) => !e.aiSummary);

/** The magnitude bar's length: the ribbon's bar height, plus a little, so minor still reads as a bar. */
export const magnitudeWidth = (score: number): number => Math.round(barHeight(score) + 12);

/** "3 captures only changed dates or counters." with Show them / Hide them: puts those captures on the ribbon and here. */
export function TrivialToggle({ count, on, onToggle }: { count: number; on: boolean; onToggle: (on: boolean) => void }) {
  if (!count) return null;
  return (
    <p className="changes-trivial">
      {count} {count === 1 ? 'capture' : 'captures'} only changed dates or counters.{' '}
      <button type="button" className="btn-link" onClick={() => onToggle(!on)}>
        {on ? 'Hide them' : 'Show them'}
      </button>
    </p>
  );
}

/**
 * Every change, newest first: one row each (when, how much, what), the selected one marked `aria-current`; each row
 * is a button that selects its change on the ribbon and the stage. The last row offers the trivial captures.
 */
export function EveryChange({ entries, selected, onSelect, trivial, showTrivial, onTrivial }: Props) {
  if (!entries.length && !trivial) return null;
  const mixed = mixedSources(entries);
  const rows = entries.map((e, i) => [e, i] as const).reverse();
  return (
    <section className="every" aria-labelledby="changes-heading" data-region="changes">
      <h3 id="changes-heading">Every change</h3>
      {entries.length > 0 && (
        // Safari drops list semantics when list-style is none, so the role is not redundant here.
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles
        <ol className="changes" role="list" aria-labelledby="changes-heading">
          {rows.map(([e, i]) => (
            <li key={`${e.from}-${e.to}`}>
              <button type="button" className="change" aria-current={i === selected ? 'true' : undefined} onClick={() => onSelect(i)}>
                <span className="change-when mono">
                  <Ts ts={e.from} month /> to <Ts ts={e.to} month />
                </span>
                <span className="change-mag" data-magnitude={e.significance.magnitude}>
                  <i style={{ width: magnitudeWidth(e.significance.score) }} aria-hidden="true" />
                  {e.significance.magnitude}
                  <span className="sr-only">,</span>
                </span>
                <span className="change-sum">
                  {shownSummary(e)}
                  {mixed && e.aiSummary && (
                    <>
                      {' '}
                      <span className="tag">AI summary</span>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <TrivialToggle count={trivial} on={showTrivial} onToggle={onTrivial} />
    </section>
  );
}
