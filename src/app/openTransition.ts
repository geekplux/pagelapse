import { flushSync } from 'react-dom';

/** The shared element's name while Open runs: the deck card or sample option before, the stage after. */
const STAGE = 'pl-stage';

/**
 * Open (docs/DESIGN.md, Motion): the clicked deck card or sample option `from` grows into the workspace's
 * stage while the hero fades and the address field settles into the header (hero.css), 350 ms ease-out. `apply`
 * renders the workspace; it runs once the data is in, so the transition only ever holds one synchronous render.
 * Without the View Transitions API, without `from`, or under reduced motion, it swaps at once.
 *
 * It never blocks input: while the overlay is up the browser hit-tests every press to `<html>`, so a press ends the
 * transition at once ({@link passThrough}) and lands where it was aimed.
 */
export function openTransition(from: HTMLElement | undefined, apply: () => void): void {
  if (!from || !('startViewTransition' in document) || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  from.style.viewTransitionName = STAGE;
  let stage: HTMLElement | null = null;
  const t = document.startViewTransition(() => {
    from.style.viewTransitionName = '';
    flushSync(apply);
    stage = document.querySelector<HTMLElement>('.vpane .vp-mat');
    stage?.style.setProperty('view-transition-name', STAGE);
  });
  const stop = passThrough(() => t.skipTransition());
  // A skipped transition (another one started, the tab hidden, a press) still applied the update.
  t.ready.catch(() => undefined);
  t.finished
    .finally(() => {
      stop();
      stage?.style.removeProperty('view-transition-name');
    })
    .catch(() => undefined);
}

/** Inputs that take a click rather than typing; every other input (and textarea, select) is a text-entry field. */
const CLICKED = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);
const isField = (el: Element): el is HTMLElement =>
  el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && !CLICKED.has(el.type)) || (el instanceof HTMLElement && el.isContentEditable);
/** What a forwarded press may activate (`tabindex="-1"` is focusable from script only, like `#content`); a press on
 * anything else (a heading, the page) forwards nothing. */
const CONTROL = 'a[href], button, input, select, textarea, label, summary, [role=button], [role=radio], [role=tab], [tabindex]:not([tabindex="-1"])';
/** A release further than this from the press is a drag, not a click. */
const SLOP_PX = 10;

/**
 * Until the returned function is called, a press that the overlay took (its target is `<html>`) first calls `skip`
 * (which removes the overlay), then goes to the element under it: a text field gets focus (and the caret); a control
 * gets focus and, if the release lands on it without dragging, the press's one click. The press's own focus change is
 * cancelled (it would blur to `<body>`). Chrome sends the release's own click to `<html>` (where the press began), drag
 * or not; it is stopped there and, for a click, answered by the forwarded one, so nothing is activated twice.
 */
function passThrough(skip: () => void): () => void {
  let press: { at: Element; control: Element; x: number; y: number; clicks: boolean } | undefined;
  const click = (e: MouseEvent) => {
    const p = press;
    done();
    if (!p || (e.target instanceof Node && p.control.contains(e.target))) return; // it reached the control itself
    e.stopPropagation();
    if (p.clicks) p.at.dispatchEvent(new MouseEvent('click', e));
  };
  const up = (e: PointerEvent) => {
    if (!press || !e.isPrimary) return;
    const still = Math.hypot(e.clientX - press.x, e.clientY - press.y) < SLOP_PX;
    // After the skip the release is hit-tested against the page itself.
    const on = document.elementFromPoint(e.clientX, e.clientY);
    if (!still || !on || !press.control.contains(on)) return done();
    press.clicks = true;
    setTimeout(done); // its click comes with the release, in the same task
  };
  const done = () => {
    press = undefined;
    document.removeEventListener('click', click, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', done, true);
  };
  const down = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    skip();
    if (e.target !== document.documentElement) return; // the page itself took it: nothing to forward
    const at = document.elementFromPoint(e.clientX, e.clientY);
    const control = at?.closest(CONTROL);
    if (!at || !control) return; // nothing to activate there: the press does what a press there does
    e.preventDefault(); // no mousedown, so focus does not fall to <body>
    if (isField(control)) return control.focus(); // a text field needs only focus (and its caret)
    const focus = control instanceof HTMLLabelElement ? control.control : control;
    if (focus instanceof HTMLElement || focus instanceof SVGElement) focus.focus({ preventScroll: true });
    // Its activation waits for the release (a skipped transition ends at once, so these may outlive it).
    done();
    press = { at, control, x: e.clientX, y: e.clientY, clicks: false };
    document.addEventListener('click', click, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', done, true);
  };
  document.addEventListener('pointerdown', down, true);
  return () => document.removeEventListener('pointerdown', down, true);
}
