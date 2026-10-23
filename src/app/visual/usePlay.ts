import { useEffect, useRef, useState } from 'react';

/** One capture per 1.2 s (D28). */
export const PLAY_MS = 1200;

/**
 * Calls `step` every `ms` until it returns false (the last capture is shown) or the returned stop function runs;
 * `onStop` runs once either way.
 */
export function createPlayer(step: () => boolean, onStop: () => void, ms = PLAY_MS): () => void {
  let on = true;
  const stop = () => {
    if (!on) return;
    on = false;
    clearInterval(id);
    onStop();
  };
  const id = setInterval(() => step() || stop(), ms);
  return stop;
}

/** Any key press or pointer down stops Play, except activating the Play / Pause button (`data-play`) itself: its click toggles. */
export const stopsPlay = (e: { type: string; key?: string }, onButton: boolean) => !(onButton && (e.type === 'pointerdown' || e.key === 'Enter' || e.key === ' '));

/**
 * The user-started time-lapse: never starts on its own, steps with `step` (which returns false at the end), and stops
 * on Pause, at the end, or on any other key press or pointer down. It never moves focus.
 */
export function usePlay(step: () => boolean) {
  const [playing, setPlaying] = useState(false);
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!playing) return;
    stop.current = createPlayer(() => stepRef.current(), () => setPlaying(false));
    const onInput = (e: Event) => stopsPlay(e as KeyboardEvent, !!(e.target as Element).closest?.('[data-play]')) && stop.current?.();
    document.addEventListener('keydown', onInput, true);
    document.addEventListener('pointerdown', onInput, true);
    return () => {
      document.removeEventListener('keydown', onInput, true);
      document.removeEventListener('pointerdown', onInput, true);
      stop.current?.();
    };
  }, [playing]);

  return { playing, toggle: () => (playing ? stop.current?.() : setPlaying(true)) };
}
