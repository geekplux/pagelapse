import type { TimelineEntry } from '../core/types.ts';
import { Ts } from './Ts.tsx';

interface Props {
  entries: readonly TimelineEntry[];
  selected: number;
  onSelect: (i: number) => void;
}

/**
 * The text alternative to the timeline: one button per change, the selected one marked `aria-current`.
 * It never scrolls in a box of its own, so every change, the selected one included, is in the page's flow.
 */
export function ChangesList({ entries, selected, onSelect }: Props) {
  return (
    // Safari drops list semantics when list-style is none, so the role is not redundant here.
    // oxlint-disable-next-line jsx-a11y/no-redundant-roles
    <ol className="changes" role="list" aria-labelledby="changes-heading">
      {entries.map((e, i) => (
        <li key={e.to}>
          <button type="button" className="change" aria-current={i === selected ? 'true' : undefined} onClick={() => onSelect(i)}>
            <Ts ts={e.to} />
            <span className="change-mag mono" data-magnitude={e.significance.magnitude}>
              {e.significance.magnitude}
            </span>
            <span className="change-sum">{e.aiSummary ?? e.ruleSummary}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
