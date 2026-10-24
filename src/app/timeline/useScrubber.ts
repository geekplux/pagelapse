import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { nearestX, stepIndex } from './scale.ts';

/** Hover reach for the tooltip (px from a bar, along x). */
const HOVER_PX = 12;
/** Grace period (ms) before a hover tip hides, so the pointer can travel from the marker onto the tip. */
const HOVER_GRACE_MS = 300;

/** True when a pointer left for an element inside `selector` (the strip and the tip hand hover to each other). */
const leftFor = (e: PointerEvent<HTMLElement>, selector: string) => e.relatedTarget instanceof Element && e.relatedTarget.closest(selector) !== null;

/**
 * Keyboard and pointer behaviour of the ribbon's slider. Keys step through changes; pointer down
 * selects the change whose bar is nearest the pointer's x, and dragging keeps snapping on x only (a horizontal drag
 * never picks a neighbour). `hover` is the change under the pointer (for the tooltip), `focusTip` is true while the
 * slider has keyboard focus.
 * Escape dismisses either tooltip, and the tooltip itself is hoverable (WCAG 1.4.13): moving away from
 * a marker hides it only after a short grace period, which entering the tip cancels, so hover ends once
 * the pointer has left both the marker and the tip. `onDragEnd` runs on pointer up after a drag (not a click).
 */
export function useScrubber(
  /** Each change's bar x, in the slider's own coordinates. */
  xs: readonly number[],
  times: readonly number[],
  selected: number,
  onSelect: (i: number) => void,
  onDragEnd?: () => void,
) {
  const [hover, setHover] = useState<number | null>(null);
  const [focusTip, setFocusTip] = useState(false);
  /** True while a pointer drag is in progress (the strip must not auto-scroll under the pointer). */
  const dragging = useRef(false);
  /** True once a captured pointer has moved (a drag, not a click). */
  const moved = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keep = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  const hoverAt = (i: number) => {
    keep();
    setHover(i);
  };
  const clearNow = () => {
    keep();
    setHover(null);
  };
  const clearSoon = () => {
    if (timer.current === undefined) timer.current = setTimeout(clearNow, HOVER_GRACE_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const dismiss = () => {
    setFocusTip(false);
    clearNow();
  };
  // A hover tip must be dismissable without moving the pointer, wherever keyboard focus is.
  const hovering = hover !== null;
  useEffect(() => {
    if (!hovering) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && dismiss();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // `dismiss` only calls state setters and clears the timer ref.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [hovering]);
  const nearest = (e: PointerEvent<HTMLElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const index = nearestX(xs, x);
    return { index, dist: index < 0 ? Infinity : Math.abs(xs[index]! - x) };
  };
  const pick = (i: number) => i >= 0 && i !== selected && onSelect(i);
  return {
    hover,
    focusTip,
    dragging,
    handlers: {
      onKeyDown(e: KeyboardEvent<HTMLElement>) {
        if (e.key === 'Escape') {
          dismiss();
          return;
        }
        const i = stepIndex(e.key, selected, times);
        if (i === null) return;
        e.preventDefault();
        setFocusTip(true);
        clearNow();
        pick(i);
      },
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        moved.current = false;
        pick(nearest(e).index);
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const n = nearest(e);
        const near = n.dist <= HOVER_PX;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          // While dragging, the tip follows the pointer at once.
          moved.current = true;
          pick(n.index);
          if (near) hoverAt(n.index);
          else clearNow();
          return;
        }
        if (near) hoverAt(n.index);
        else clearSoon();
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        e.currentTarget.releasePointerCapture(e.pointerId);
        const dragged = dragging.current && moved.current;
        dragging.current = false;
        moved.current = false;
        if (dragged) onDragEnd?.();
      },
      onPointerLeave: (e: PointerEvent<HTMLElement>) => leftFor(e, '.rb-tip') || clearSoon(),
      onFocus: (e: { currentTarget: HTMLElement }) => setFocusTip(e.currentTarget.matches(':focus-visible')),
      onBlur: () => setFocusTip(false),
    },
    /** For the tooltip: entering it keeps (or pins) its change as hovered; leaving it clears unless back on the strip. */
    tipHandlers: (index: number) => ({
      onPointerEnter: () => hoverAt(index),
      onPointerLeave: (e: PointerEvent<HTMLElement>) => leftFor(e, '.rb-slider') || clearSoon(),
    }),
  };
}
