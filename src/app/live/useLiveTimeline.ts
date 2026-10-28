import { useEffect, useReducer, useRef } from 'react';
import { mapLimit } from '../../archive/politeFetch.ts';
import { ApiError, fetchCaptures, fetchSnapshot } from './api.ts';
import { fetchOrder, initialLive, liveReducer } from './liveState.ts';

/** Answers already received this session (captures are immutable, listings change slowly): a re-run costs nothing. */
const cache = new Map<string, unknown>();
async function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, await load());
  return cache.get(key) as T;
}

/** At most this many snapshot requests in flight. */
const CONCURRENCY = 2;

/**
 * Runs a live lookup of `url` on mount: the capture list, then each capture's text, two at a time, first and latest
 * first and then ever finer (`fetchOrder`), so the decade compare shows after one round.
 * A capture that fails is skipped (its thumbnail says "not fetched"); a rate limit stops the run. Unmounting or `cancel` aborts everything in flight.
 */
export function useLiveTimeline(url: string) {
  const [state, dispatch] = useReducer(liveReducer, url, initialLive);
  const ctrl = useRef<AbortController>(null);
  useEffect(() => {
    const c = new AbortController();
    ctrl.current = c;
    const { signal } = c;
    void (async () => {
      try {
        const res = await once(`c:${url}`, () => fetchCaptures(url, signal));
        const captures = [...res.captures].sort((x, y) => (x.ts < y.ts ? -1 : 1));
        dispatch({ type: 'captures', captures });
        await mapLimit(fetchOrder(captures.length), CONCURRENCY, async (index) => {
          const { ts, digest } = captures[index]!;
          // After a cancel or a fatal error, the remaining captures are never requested.
          signal.throwIfAborted();
          try {
            const page = await once(`s:${url}:${ts}`, () => fetchSnapshot(url, ts, signal));
            if (!signal.aborted) dispatch({ type: 'snapshot', index, page: { ...page, ts, digest } });
          } catch (err) {
            if (!(err instanceof ApiError) || err.code === 'archive_rate_limited' || err.code === 'rate_limited') throw err;
            if (!signal.aborted) dispatch({ type: 'snapshot', index, page: null });
          }
        });
      } catch (err) {
        if (signal.aborted || !(err instanceof ApiError)) return;
        c.abort();
        dispatch({ type: 'error', error: err });
      }
    })();
    return () => c.abort();
  }, [url]);
  const cancel = () => {
    ctrl.current?.abort();
    dispatch({ type: 'cancel' });
  };
  return { state, cancel };
}
