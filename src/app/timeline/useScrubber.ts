import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { nearestPoint, stepIndex } from './scale.ts';

/** Hover radius for the tooltip (px from a marker centre). */
const HOVER_PX = 24;

/**
 * Keyboard and pointer behaviour of the timeline slider. Keys step through changes; pointer down
 * selects the nearest marker and dragging keeps snapping to the nearest one. `hover` is the marker
 * under the pointer (for the tooltip), `focusTip` is true while the slider has keyboard focus.
 */
export function useScrubber(points: readonly { x: number; y: number }[], times: readonly number[], selected: number, onSelect: (i: number) => void) {
  const [hover, setHover] = useState<number | null>(null);
  const [focusTip, setFocusTip] = useState(false);
  /** True while a pointer drag is in progress (the strip must not auto-scroll under the pointer). */
  const dragging = useRef(false);
  const nearest = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return nearestPoint(points, e.clientX - r.left, e.clientY - r.top);
  };
  const pick = (i: number) => i >= 0 && i !== selected && onSelect(i);
  return {
    hover,
    focusTip,
    dragging,
    handlers: {
      onKeyDown(e: KeyboardEvent<HTMLElement>) {
        const i = stepIndex(e.key, selected, times);
        if (i === null) return;
        e.preventDefault();
        setFocusTip(true);
        setHover(null);
        pick(i);
      },
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        pick(nearest(e).index);
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const n = nearest(e);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(n.index);
        setHover(n.dist <= HOVER_PX ? n.index : null);
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        e.currentTarget.releasePointerCapture(e.pointerId);
        dragging.current = false;
      },
      onPointerLeave: () => setHover(null),
      onFocus: (e: { currentTarget: HTMLElement }) => setFocusTip(e.currentTarget.matches(':focus-visible')),
      onBlur: () => setFocusTip(false),
    },
  };
}
