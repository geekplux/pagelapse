import { useCallback, useEffect, useRef, useState } from 'react';

/** A selection mounts its frame(s) once it has rested this long, so fast scrubbing loads only where it stops. */
export const REST_MS = 400;
/** A neighbour preloads once the shown frame has loaded and everything has rested this long. */
export const PRELOAD_MS = 2000;
/** At most this many archive frames are mounted at once. */
export const POOL_SIZE = 3;

export interface PoolInput {
  /** Mounted frames, least recently used first. */
  pool: readonly string[];
  /** The capture(s) the mode shows: one in Single, both sides in the compare modes. */
  want: readonly string[];
  /** The captures the user steps through, oldest first (neighbours come from here). */
  steps: readonly string[];
  /** Direction of travel: 1 forward in time, -1 back. */
  direction: 1 | -1;
  /** Milliseconds since the selection (or mode) last changed. */
  restMs: number;
  /** Milliseconds since every wanted frame had loaded; `null` while one is still loading. */
  loadedMs: number | null;
  compare: boolean;
  saveData: boolean;
  /** A live run is still fetching snapshots. */
  runActive: boolean;
  /** The selection is following a live run on its own (the user has not picked anything yet): mount nothing new. */
  hold: boolean;
}

/**
 * Which archive frames to keep mounted (least recently used first): nothing new while the selection only
 * follows a live run (each rest would load an archived page nobody asked for), nor until it has rested 400 ms; then the wanted frame(s); then, 2 s after they loaded, the one next capture in the direction of travel,
 * hidden, never in compare modes, under Save-Data or while a run fetches. The pool keeps at most 3, evicting the oldest.
 */
export function nextFramesToMount(i: PoolInput): string[] {
  if (i.hold || i.restMs < REST_MS) return [...i.pool];
  const next = [...i.pool.filter((t) => !i.want.includes(t)), ...i.want];
  const at = i.steps.indexOf(i.want[0] ?? '');
  const near = at < 0 ? undefined : (i.steps[at + i.direction] ?? i.steps[at - i.direction]);
  const idle = i.loadedMs !== null && Math.min(i.restMs, i.loadedMs) >= PRELOAD_MS;
  if (near && idle && !i.compare && !i.saveData && !i.runActive && !next.includes(near)) next.splice(next.length - i.want.length, 0, near);
  return next.slice(-Math.max(POOL_SIZE, i.want.length));
}

const saveData = () => (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * The live pane's frame pool: which captures have a mounted `<iframe>` and which have loaded. It re-applies
 * {@link nextFramesToMount} when the selection changes, when a frame loads and when a rest timer fires. A new `scope`
 * (the shown mode: its frames sit elsewhere in the DOM) starts from an empty pool.
 */
export function useFramePool(want: readonly string[], steps: readonly string[], opts: { scope: string; compare: boolean; runActive: boolean; hold: boolean }) {
  const scope = want.length ? opts.scope : '';
  const [s, setS] = useState({ scope, pool: [] as string[], loaded: new Map<string, number>() });
  if (s.scope !== scope) setS({ scope, pool: [], loaded: new Map() });
  const [tick, setTick] = useState(0);
  const key = want.join(' ');
  const rest = useRef({ key: '', since: 0, direction: 1 as 1 | -1 });
  if (rest.current.key !== key) {
    const prev = rest.current.key.split(' ')[0] ?? '';
    rest.current = { key, since: Date.now(), direction: !prev || (want[0] ?? '') >= prev ? 1 : -1 };
  }
  const { pool, loaded } = s;
  useEffect(() => {
    if (!want.length) return;
    const now = Date.now();
    const times = want.map((t) => loaded.get(t));
    const loadedAt = times.every((t) => t !== undefined) ? Math.max(...(times as number[])) : null;
    const next = nextFramesToMount({
      pool, want, steps, direction: rest.current.direction, restMs: now - rest.current.since, loadedMs: loadedAt === null ? null : now - loadedAt,
      compare: opts.compare, saveData: saveData(), runActive: opts.runActive, hold: opts.hold,
    });
    // An evicted frame loads from scratch if it comes back.
    if (next.join(' ') !== pool.join(' ')) setS((x) => ({ ...x, pool: next, loaded: new Map([...x.loaded].filter(([t]) => next.includes(t))) }));
    // Wake up when the next rule can apply: the end of the rest, or 2 s after the load.
    const due = [rest.current.since + REST_MS, Math.max(rest.current.since, loadedAt ?? Infinity) + PRELOAD_MS].find((t) => t > now && t < Infinity);
    if (due === undefined) return;
    const timer = setTimeout(() => setTick((n) => n + 1), due - now + 5);
    return () => clearTimeout(timer);
    // `want` and `steps` are tracked by their joined values.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, steps.join(' '), pool, loaded, tick, opts.compare, opts.runActive, opts.hold]);
  const onLoad = useCallback((ts: string) => setS((x) => (x.loaded.has(ts) || !x.pool.includes(ts) ? x : { ...x, loaded: new Map(x.loaded).set(ts, Date.now()) })), []);
  return { frames: pool, loaded, onLoad };
}
