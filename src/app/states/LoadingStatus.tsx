import { useEffect, useState } from 'react';

/** Seconds of silence after which the status line says the Archive is slow (it can take ~30 s when it is down). */
const SLOW_S = 8;

/** The live run's status line with Cancel, or Start again once it has stopped. */
export function LoadingStatus({ text, running, onCancel, onRetry }: { text: string; running: boolean; onCancel: () => void; onRetry: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!running) return;
    const t = setTimeout(() => setSlow(true), SLOW_S * 1000);
    return () => clearTimeout(t);
  }, [text, running]);
  return (
    <div className="live-status" data-running={running || undefined}>
      <p className="mono">
        {running && <span className="live-dot" aria-hidden="true" />}
        {text}
        {slow && ' · still waiting for the Internet Archive, which can take up to a minute when it is busy'}
      </p>
      <button type="button" className="btn" onClick={running ? onCancel : onRetry}>
        {running ? 'Cancel' : 'Start again'}
      </button>
    </div>
  );
}
