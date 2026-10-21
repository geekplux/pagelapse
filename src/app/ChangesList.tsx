import type { TimelineEntry } from '../core/types.ts';
import { Ts } from './Ts.tsx';

interface Props {
  entries: readonly TimelineEntry[];
  selected: number;
  onSelect: (i: number) => void;
}

/** Where the list's summaries come from, said once for the whole list. */
export function sourceNote(entries: readonly TimelineEntry[]): string {
  const ai = entries.filter((e) => e.aiSummary).length;
  if (!ai) return 'Summaries: auto summary (rules)';
  return ai === entries.length ? 'Summaries: AI summary (Workers AI)' : 'Summaries: mixed: items marked AI are by Workers AI';
}

/**
 * The text alternative to the timeline: one button per change in time order, a single column, the selected one marked
 * `aria-current`, after one note on where the summaries come from (in a mix, AI items say "AI").
 * It never scrolls in a box of its own, so every change, the selected one included, is in the page's flow.
 */
export function ChangesList({ entries, selected, onSelect }: Props) {
  const note = sourceNote(entries);
  const mixed = note.includes('mixed');
  return (
    <>
    <p className="changes-note mono">{note}</p>
    {/* Safari drops list semantics when list-style is none, so the role is not redundant here. */}
    {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
    <ol className="changes" role="list" aria-labelledby="changes-heading">
      {entries.map((e, i) => (
        <li key={e.to}>
          <button type="button" className="change" aria-current={i === selected ? 'true' : undefined} onClick={() => onSelect(i)}>
            <Ts ts={e.to} />
            <span className="change-mag mono" data-magnitude={e.significance.magnitude}>
              {e.significance.magnitude}
            </span>
            <span className="change-sum">
              {e.aiSummary ?? e.ruleSummary}
              {mixed && e.aiSummary && <span className="source-label mono"> AI</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
    </>
  );
}
