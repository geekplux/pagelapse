import { type CSSProperties, type ReactNode, useId, useRef, useState } from 'react';
import { splitFromKey, splitFromPointer, splitText } from './visualState.ts';

interface Props {
  entry: { from: string; to: string };
  before: ReactNode;
  after: ReactNode;
}

/**
 * After drawn over Before and clipped at a divider (`--split`). The divider is a `role="slider"`: arrows ±5,
 * PageUp/PageDown ±25, Home/End, Enter or double-click back to 50%, and a 32 px wide pointer-captured drag strip. A
 * single click or tap anywhere on the pictures moves the divider there (no drag needed, WCAG 2.5.7).
 */
export function CompareSlider({ entry, before, after }: Props) {
  const [split, setSplit] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const hint = useId();
  const drag = (e: { clientX: number }) => {
    const r = box.current!.getBoundingClientRect();
    setSplit(splitFromPointer(e.clientX, r.left, r.width));
  };
  return (
    // The click is a pointer shortcut; the divider below is the keyboard-operable slider.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="vp-cmp"
      ref={box}
      style={{ '--split': `${split}%` } as CSSProperties}
      onClick={(e) => !(e.target as Element).closest('.vp-split') && drag(e)}
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
        aria-valuenow={split}
        aria-valuetext={splitText(split, entry)}
        aria-keyshortcuts="Enter"
        aria-describedby={hint}
        onKeyDown={(e) => {
          const v = splitFromKey(e.key, split);
          if (v === null) return;
          e.preventDefault();
          setSplit(v);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && drag(e)}
        onDoubleClick={() => setSplit(50)}
      >
        <span className="vp-knob" aria-hidden="true">
          ‹ ›
        </span>
      </div>
      <span id={hint} hidden>
        Enter resets it to 50%.
      </span>
    </div>
  );
}
