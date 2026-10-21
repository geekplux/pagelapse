import { useEffect, useState } from 'react';

/** Seconds of silence after which the status line says the Archive is slow (it can take ~30 s when it is down). */
const SLOW_S = 8;

/** The live run's status line: Cancel while it runs, Start again when it was stopped (`onRetry`), no button once done. */
export function LoadingStatus({ text, running, onCancel, onRetry }: { text: string; running: boolean; onCancel: () => void; onRetry?: (() => void) | undefined }) {
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
      <p className="mono">
        {running && <span className="live-dot" aria-hidden="true" />}
        {text}
        {slow && ' · still waiting for the Internet Archive, which can take up to a minute when it is busy'}
      </p>
      {(running || onRetry) && (
        <button type="button" className="btn" onClick={running ? onCancel : onRetry}>
          {running ? 'Cancel' : 'Start again'}
        </button>
      )}
    </div>
  );
}
