import { useEffect, useRef, useState } from 'react';
import type { TimelineEntry } from '../../core/types.ts';
import { pairOf } from '../visual/visualState.ts';
import { fetchSummaries } from './api.ts';

/** Pairs per request (the Worker's batch size), and how many new changes are worth a request mid-run. */
const BATCH = 8;
const EVERY = 4;
/** AI lines already received this session, by `"<url> <pair>"`: a re-run asks for nothing it has. */
const known = new Map<string, string>();

/**
 * AI one-liners for a live run's meaningful changes, by pair. It asks the Worker every {@link EVERY} new changes and
 * once the run ends, never twice for a pair. Any failure is silent: the entries keep their rule summaries (AC 11).
 */
export function useSummaries(url: string, entries: readonly TimelineEntry[], ended: boolean): ReadonlyMap<string, string> {
  const [ai, setAi] = useState(() => new Map<string, string>());
  const asked = useRef(new Set<string>());
  const ctrl = useRef<AbortController>(null);
  // Abort on unmount; a fresh controller after StrictMode's dev remount.
  useEffect(
    () => () => {
      ctrl.current?.abort();
      ctrl.current = null;
    },
    [],
  );
  useEffect(() => {
    const todo = entries.filter((e) => !asked.current.has(pairOf(e)));
    if (!todo.length || (!ended && todo.length < EVERY)) return;
    for (const e of todo) asked.current.add(pairOf(e));
    const have = todo.flatMap((e) => (known.has(`${url} ${pairOf(e)}`) ? [[pairOf(e), known.get(`${url} ${pairOf(e)}`)!] as const] : []));
    const ask = todo.filter((e) => !known.has(`${url} ${pairOf(e)}`)).map(({ from, to }) => ({ from, to }));
    if (have.length) setAi((m) => new Map([...m, ...have]));
    ctrl.current ??= new AbortController();
    const { signal } = ctrl.current;
    void (async () => {
      for (let i = 0; i < ask.length; i += BATCH) {
        const res = await fetchSummaries(url, ask.slice(i, i + BATCH), signal).catch(() => null);
        if (!res || signal.aborted) return;
        const got = res.summaries.flatMap((s) => (s.source === 'ai' && s.text ? [[s.pair, s.text] as const] : []));
        for (const [pair, text] of got) known.set(`${url} ${pair}`, text);
        if (got.length) setAi((m) => new Map([...m, ...got]));
      }
    })();
  }, [url, entries, ended]);
  return ai;
}
