import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { SampleFixture } from '../../core/types.ts';
import { scrollWithin } from '../keepInView.ts';
import { Ts } from '../Ts.tsx';
import { frameNo, shotSrc } from './visualState.ts';

interface Props {
  fixture: SampleFixture;
  /** The capture shown in the pane. */
  at: string;
  trivial: ReadonlySet<string>;
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
export function Filmstrip({ fixture, at, trivial, onSelect }: Props) {
  const { snapshots } = fixture;
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
      <div className="film-head">
        <h3 id="film-heading">Filmstrip</h3>
        <p className="captures-source" id="film-hint">
          {snapshots.length} captures, oldest first. Arrow keys move along the strip; Enter shows a capture.
        </p>
      </div>
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
              {s.shot?.file ? (
                <img src={shotSrc(fixture.id, s.shot.file, true)} width={320} height={200} alt="" loading="lazy" decoding="async" />
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
                {s.shot?.status === 'partial' && (
                  <span className="frame-partial">
                    <span aria-hidden="true">◐ </span>partial
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
