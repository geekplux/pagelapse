import { useEffect, useState } from 'react';

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
}

/** The live run's status line: Cancel while it runs, Start again when it was stopped (`onRetry`), no button once done. */
export function LoadingStatus({ text, running, progress, onCancel, onRetry, textRef }: Props) {
  // The status text that has been showing for SLOW_S seconds while running: a new text resets the wait.
  const [stuck, setStuck] = useState('');
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setStuck(text), SLOW_S * 1000);
    return () => clearTimeout(t);
  }, [text, running]);
  const slow = running && stuck === text;
  return (
    <div className="live-status" data-running={running || undefined}>
      <p className="mono" tabIndex={-1} ref={textRef}>
        {running && <span className="live-dot" aria-hidden="true" />}
        {text}
        {slow && ' · still waiting for the Internet Archive, which can take up to a minute when it is busy'}
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
