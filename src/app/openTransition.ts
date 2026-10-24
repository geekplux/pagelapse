import { flushSync } from 'react-dom';

/** The shared element's name while Open runs: the deck card or sample option before, the stage after. */
const STAGE = 'pl-stage';

/**
 * Open (docs/redesign/DESIGN.md, Motion): the clicked deck card or sample option `from` grows into the workspace's
 * stage while the hero fades and the address field settles into the header (hero.css), 350 ms ease-out. `apply`
 * renders the workspace; it runs once the data is in, so the transition only ever holds one synchronous render.
 * Without the View Transitions API, without `from`, or under reduced motion, it swaps at once.
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
  // A skipped transition (another one started, the tab hidden) still applied the update.
  t.ready.catch(() => undefined);
  t.finished.finally(() => stage?.style.removeProperty('view-transition-name')).catch(() => undefined);
}
