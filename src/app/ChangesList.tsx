import { useEffect, useRef } from 'react';
import type { TimelineEntry } from '../core/types.ts';
import { scrollBoxOf, scrollWithin } from './keepInView.ts';
import { Ts } from './Ts.tsx';

interface Props {
  entries: readonly TimelineEntry[];
  selected: number;
  onSelect: (i: number) => void;
}

/**
 * The text alternative to the timeline: one button per change, the selected one marked `aria-current`.
 * Where the list scrolls in its own box (desktop), the selected change is kept in view there, never by scrolling the page.
 */
export function ChangesList({ entries, selected, onSelect }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const box = el && scrollBoxOf(el);
    // Instant on first view; later the box's CSS picks smooth, or instant under reduced motion.
    if (box) scrollWithin(box, el, 'y', !mounted.current);
    mounted.current = true;
  }, [selected, entries]);

  return (
    // Safari drops list semantics when list-style is none, so the role is not redundant here.
    // oxlint-disable-next-line jsx-a11y/no-redundant-roles
    <ol className="changes" role="list" aria-labelledby="changes-heading" ref={list}>
      {entries.map((e, i) => (
        <li key={e.to}>
          <button type="button" className="change" aria-current={i === selected ? 'true' : undefined} onClick={() => onSelect(i)}>
            <Ts ts={e.to} />
            <span className="change-mag mono" data-magnitude={e.significance.magnitude}>
              {e.significance.magnitude}
            </span>
            <span className="change-sum">{e.ruleSummary}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
