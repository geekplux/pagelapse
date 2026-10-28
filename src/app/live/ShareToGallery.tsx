import { useEffect, useRef, useState } from 'react';
import { ApiError, shareToGallery } from './api.ts';

type State = 'idle' | 'sending' | 'shared' | { error: string };

/**
 * After a live run: lists the page in "Recently explored" on the home page. Nothing is shared until it is pressed
 * (README, Privacy); the Worker accepts only a page whose captures it has just fetched.
 */
export function ShareToGallery({ url }: { url: string }) {
  const [state, setState] = useState<State>('idle');
  const ctrl = useRef<AbortController>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const send = () => {
    ctrl.current = new AbortController();
    setState('sending');
    shareToGallery(url, ctrl.current.signal).then(
      () => setState('shared'),
      (err) => ctrl.current?.signal.aborted || setState({ error: err instanceof ApiError ? err.message : 'It could not be added.' }),
    );
  };
  if (state === 'shared') {
    return (
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      <span className="share-done" role="status">
        Added to Recently explored
      </span>
    );
  }
  return (
    <span className="share">
      <button type="button" className="btn-link" aria-disabled={state === 'sending' || undefined} onClick={state === 'sending' ? undefined : send}>
        {state === 'sending' ? 'Adding…' : 'Add to Recently explored'}
      </button>
      {typeof state === 'object' && (
        <span className="share-error" role="alert">
          {state.error}
        </span>
      )}
    </span>
  );
}
