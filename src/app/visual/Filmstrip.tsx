import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { scrollWithin } from '../keepInView.ts';
import { Ts } from '../Ts.tsx';
import { Silhouette } from './Silhouette.tsx';
import { type CaptureView, frameNo } from './visualState.ts';

interface Props {
  /** One per capture, oldest first: a recorded thumbnail, a text silhouette (live) or no picture. */
  items: readonly CaptureView[];
  /** The capture shown in the pane. */
  at: string;
  trivial: ReadonlySet<string>;
  /** Live runs: captures still to come keep their place (empty dotted frames), so nothing below moves as they arrive. */
  pending?: number;
  onSelect: (ts: string) => void;
}

const STEP: Record<string, (i: number, n: number) => number> = {
  ArrowLeft: (i) => i - 1,
  ArrowRight: (i) => i + 1,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/**
 * The contact sheet: one numbered, dated thumbnail per capture. A single tab stop with roving focus
 * (Left/Right/Home/End); Enter or Space shows that capture. The shown frame is `aria-current`, outlined and carets.
 */
export function Filmstrip({ items: snapshots, at, trivial, onSelect, pending = 0 }: Props) {
  const outlines = snapshots.some((s) => s.page);
  const sel = snapshots.findIndex((s) => s.ts === at);
  // The roving tab stop; it snaps back to the shown frame whenever the selection changes.
  const [roving, setRoving] = useState({ sel, i: sel });
  const focus = roving.sel === sel ? roving.i : sel;
  const setFocus = (i: number) => setRoving({ sel, i });
  const list = useRef<HTMLOListElement>(null);
  const buttons = () => list.current?.querySelectorAll('button') ?? [];

  // Keep the shown frame in view by scrolling the strip only (never the page); CSS picks smooth or instant.
  useEffect(() => {
    const box = list.current;
    const el = buttons()[sel]?.parentElement;
    if (box && el) scrollWithin(box, el, 'x');
  }, [sel]);

  const onKeyDown = (e: KeyboardEvent) => {
    const step = STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const next = Math.min(Math.max(step(focus, snapshots.length), 0), snapshots.length - 1);
    setFocus(next);
    buttons()[next]?.focus();
  };

  return (
    <div className="film">
      <h3 id="film-heading" className="sr-only">
        Filmstrip
      </h3>
      {/* The strip's help: the focused frame's description (and the footer's "Keyboard shortcuts"), not visible text. */}
      <p id="film-hint" hidden>
        {snapshots.length} captures, oldest first.{outlines && ' Thumbnails are text outlines of each capture, not pictures.'} Arrow keys move along the strip; Enter shows a capture.
      </p>
      {/* Safari drops list semantics when list-style is none, so the role is not redundant here. */}
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles, jsx-a11y/no-noninteractive-element-interactions */}
      <ol className="film-strip" role="list" aria-labelledby="film-heading" ref={list} onKeyDown={onKeyDown}>
        {snapshots.map((s, i) => (
          <li key={s.ts}>
            <button
              type="button"
              className="frame"
              tabIndex={i === focus ? 0 : -1}
              aria-current={i === sel ? 'true' : undefined}
              aria-describedby={i === focus ? 'film-hint' : undefined}
              data-trivial={trivial.has(s.ts) || undefined}
              onClick={() => onSelect(s.ts)}
              onFocus={() => setFocus(i)}
            >
              {s.thumb ? (
                <img src={s.thumb} width={320} height={200} alt="" loading="lazy" decoding="async" />
              ) : s.page ? (
                <Silhouette page={s.page} />
              ) : (
                <span className="frame-none">no picture</span>
              )}
              <span className="frame-cap mono">
                <span className="sr-only">Frame </span>
                {frameNo(i)} <Ts ts={s.ts} />
                {trivial.has(s.ts) && (
                  <span className="frame-trivial">
                    <span aria-hidden="true">▯ </span>trivial
                  </span>
                )}
                {s.status === 'partial' && (
                  <span className="frame-partial">
                    <span aria-hidden="true">◐ </span>partial
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
        {Array.from({ length: pending }, (_, i) => (
          <li key={`p${i}`} className="frame frame-pending" aria-hidden="true">
            <span className="frame-none" />
            <span className="frame-cap mono">&nbsp;</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
