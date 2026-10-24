import { flushSync } from 'react-dom';

/** The shared element's name while Open runs: the deck card or sample option before, the stage after. */
const STAGE = 'pl-stage';

/**
 * Open (docs/redesign/DESIGN.md, Motion): the clicked deck card or sample option `from` grows into the workspace's
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

const FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Until the returned function is called, a press that the overlay took (its target is `<html>`) first calls `skip`
 * (which removes the overlay), then goes to the element under it: a field gets focus (and the caret), anything else
 * gets the press's one click. The press's own focus change is cancelled (it would blur to `<body>`); its own click,
 * which the browser sends to `<html>`, is answered by the forwarded one, so nothing is activated twice.
 */
function passThrough(skip: () => void): () => void {
  let aimed: Element | undefined;
  const click = (e: MouseEvent) => {
    const to = aimed;
    done();
    if (!to || (e.target instanceof Node && to.contains(e.target))) return;
    e.stopPropagation();
    to.dispatchEvent(new MouseEvent('click', e));
  };
  // The press's click comes with its release, in the same task; a release without one (a drag) forwards nothing.
  const up = () => setTimeout(done);
  const done = () => {
    aimed = undefined;
    document.removeEventListener('click', click, true);
    document.removeEventListener('pointerup', up, true);
  };
  const down = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    skip();
    if (e.target !== document.documentElement) return; // the page itself took it: nothing to forward
    const at = document.elementFromPoint(e.clientX, e.clientY);
    if (!at || at === document.documentElement) return;
    e.preventDefault(); // no mousedown, so focus does not fall to <body>
    const field = at.closest<HTMLElement>(FIELD);
    if (field) return field.focus(); // a field needs only focus (and its caret)
    at.closest<HTMLElement>('button, a[href], label, summary, [tabindex]')?.focus({ preventScroll: true });
    // Its click goes to <html> (where the press began), so the element aimed at gets it instead, once. This may come
    // after the transition has ended (a skipped one ends at once).
    done();
    aimed = at;
    document.addEventListener('click', click, true);
    document.addEventListener('pointerup', up, true);
  };
  document.addEventListener('pointerdown', down, true);
  return () => document.removeEventListener('pointerdown', down, true);
}
