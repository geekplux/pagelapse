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

