import { type CSSProperties, type ReactNode, useId, useRef, useState } from 'react';
import { splitFromKey, splitFromPointer, splitText } from './visualState.ts';

interface Props {
  entry: { from: string; to: string };
  before: ReactNode;
  after: ReactNode;
}

/**
 * After drawn over Before and clipped at a divider (`--split`). The divider is a `role="slider"`: arrows ±5,
 * PageUp/PageDown ±25, Home/End, Enter or double-click back to 50%, and a 40 px wide pointer-captured drag strip that
 * follows the pointer 1:1. Keys and clicks glide (250 ms ease-out); a drag does not. A single click or tap anywhere on
 * the pictures moves the divider there (no drag needed, WCAG 2.5.7). A new change starts at 50%.
 */
export function CompareSlider({ entry, before, after }: Props) {
  const pair = `${entry.from}-${entry.to}`;
  const [state, setState] = useState({ pair, split: 50, glide: false });
  if (state.pair !== pair) setState({ pair, split: 50, glide: false });
  const { split, glide } = state.pair === pair ? state : { split: 50, glide: false };
  const set = (v: number, g: boolean) => setState({ pair, split: v, glide: g });
  const box = useRef<HTMLDivElement>(null);
  const hint = useId();
  const at = (e: { clientX: number }) => {
    const r = box.current!.getBoundingClientRect();
    return splitFromPointer(e.clientX, r.left, r.width);
  };
  return (
    // The click is a pointer shortcut; the divider below is the keyboard-operable slider.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="vp-cmp"
      ref={box}
      data-glide={glide || undefined}
      style={{ '--split': `${split}%` } as CSSProperties}
      onClick={(e) => !(e.target as Element).closest('.vp-split') && set(at(e), true)}
    >
      {before}
      <div className="vp-clip">{after}</div>
      <div
        className="vp-split"
        // A native range cannot be the full-height divider with its own drag strip; this div implements the APG slider.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="slider"
        tabIndex={0}
        aria-label="Divider between Before and After"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        aria-valuetext={splitText(split, entry)}
        aria-keyshortcuts="Enter"
        aria-describedby={hint}
        onKeyDown={(e) => {
          const v = splitFromKey(e.key, split);
          if (v === null) return;
          e.preventDefault();
          set(v, true);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          set(at(e), false);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && set(at(e), false)}
        onDoubleClick={() => set(50, true)}
      >
        <span className="vp-knob" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path d="M8 6 4 10l4 4M12 6l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <span id={hint} hidden>
        Enter resets it to 50%.
      </span>
    </div>
  );
}
