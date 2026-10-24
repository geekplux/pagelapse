import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Where focus was in a status line: on its button, on its text, or elsewhere. */
export type StatusFocus = 'button' | 'text' | null;

/** Seconds of silence after which the status line says the Archive is slow (it can take ~30 s when it is down). */
const SLOW_S = 8;

interface Props {
  text: string;
  running: boolean;
  /** Captures done and in all: a determinate bar beside the counter in the text. */
  progress?: readonly [number, number] | undefined;
  onCancel: () => void;
  onRetry?: (() => void) | undefined;
  /** The status text, which takes focus when the button it had goes away (it is focusable from script only). */
  textRef?: ((el: HTMLElement | null) => void) | undefined;
  /**
   * Where focus was in the line when it last unmounted. The caller moves the line between places (a remount), and a
   * new line takes focus back: on its button if it has one, else on its text.
   */
  carry?: { take: () => StatusFocus; keep: (where: StatusFocus) => void } | undefined;
}

/** The live run's status line: Cancel while it runs, Start again when it was stopped (`onRetry`), no button once done. */
export function LoadingStatus({ text, running, progress, onCancel, onRetry, textRef, carry }: Props) {
  const root = useRef<HTMLDivElement>(null);
  // A layout effect: its cleanup runs while the old line is still in the document, and the new line's runs in the
  // same commit, before anything paints or the focus could go anywhere else.
  useLayoutEffect(() => {
    const el = root.current;
    if (!carry || !el) return;
    const want = carry.take();
    if (want) ((want === 'button' && el.querySelector('button')) || el.querySelector('p'))?.focus({ preventScroll: true });
    return () => {
      const a = document.activeElement;
      carry.keep(a && el.contains(a) ? (a instanceof HTMLButtonElement ? 'button' : 'text') : null);
    };
  }, [carry]);
  // The status text that has been showing for SLOW_S seconds while running: a new text resets the wait.
  const [stuck, setStuck] = useState('');
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setStuck(text), SLOW_S * 1000);
    return () => clearTimeout(t);
  }, [text, running]);
  const slow = running && stuck === text;
  return (
    <div className="live-status" ref={root} data-running={running || undefined}>
      <p className="mono" tabIndex={-1} ref={textRef}>
        {running && <span className="live-dot" aria-hidden="true" />}
        {text}
        {slow && ' Still waiting for the Internet Archive, which can take up to a minute when it is busy.'}
      </p>
      {/* The text says the same count, so the bar is not announced twice. */}
      {running && progress && <progress className="live-bar" max={progress[1]} value={progress[0]} aria-hidden="true" />}
      {(running || onRetry) && (
        <button type="button" className="btn" onClick={running ? onCancel : onRetry}>
          {running ? 'Cancel' : 'Start again'}
        </button>
      )}
    </div>
  );
}
