/**
 * Where to scroll a box so an item inside it is fully visible, along one axis: `null` when it already is
 * (so nothing moves), else the scroll position that centres it (the browser clamps to the scroll range).
 * `start` is the item's offset in the box's scrolled content; `scroll` and `view` are the box's position and size;
 * `padStart` / `padEnd` (the box's `scroll-padding`) are covered edges, e.g. by a sticky heading, that do not count as visible.
 */
export function keepInView(start: number, size: number, scroll: number, view: number, padStart = 0, padEnd = 0): number | null {
  if (start >= scroll + padStart && start + size <= scroll + view - padEnd) return null;
  return Math.round(start - padStart - (view - padStart - padEnd - size) / 2);
}

/**
 * Scrolls `box` (only `box`, never the page) so `el` is fully visible. Smooth or instant comes from the
 * box's CSS `scroll-behavior` (smooth only when motion is allowed); `instant` forces no animation.
 */
export function scrollWithin(box: HTMLElement, el: HTMLElement, axis: 'x' | 'y', instant = false): void {
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const x = axis === 'x';
  const start = x ? r.left - b.left - box.clientLeft + box.scrollLeft : r.top - b.top - box.clientTop + box.scrollTop;
  const cs = getComputedStyle(box);
  const pad = (v: string) => parseFloat(v) || 0;
  const to = keepInView(
    start,
    x ? r.width : r.height,
    x ? box.scrollLeft : box.scrollTop,
    x ? box.clientWidth : box.clientHeight,
    pad(x ? cs.scrollPaddingLeft : cs.scrollPaddingTop),
    pad(x ? cs.scrollPaddingRight : cs.scrollPaddingBottom),
  );
  if (to === null) return;
  box.scrollTo({ [x ? 'left' : 'top']: to, ...(instant && { behavior: 'instant' }) });
}
