import { describe, expect, it } from 'vitest';
import { type PoolInput, nextFramesToMount } from './useFramePool.ts';

const steps = ['a', 'b', 'c', 'd', 'e'];
const at = (o: Partial<PoolInput>): string[] =>
  nextFramesToMount({ pool: [], want: ['c'], steps, direction: 1, restMs: 5000, loadedMs: 3000, compare: false, saveData: false, runActive: false, hold: false, ...o });

describe('nextFramesToMount', () => {
  it('mounts nothing new until the selection has rested 400 ms', () => {
    expect(at({ pool: ['a'], restMs: 399 })).toEqual(['a']);
    expect(at({ pool: ['a'], restMs: 400, loadedMs: null })).toEqual(['a', 'c']);
  });

  it('mounts nothing while the selection only follows a live run, then the selected capture once released', () => {
    // A run with no user input: however long the newest change rests, no frame (and no preload) mounts.
    expect(at({ runActive: true, hold: true, restMs: 60_000, loadedMs: null })).toEqual([]);
    expect(at({ runActive: true, hold: true, restMs: 60_000 })).toEqual([]);
    // The run finished (or the user picked): only the selected capture, no neighbour before it has loaded.
    expect(at({ hold: false, restMs: 400, loadedMs: null })).toEqual(['c']);
    expect(at({ runActive: true, hold: false, loadedMs: null })).toEqual(['c']);
  });

  it('preloads one neighbour in the direction of travel, only 2 s after load and rest', () => {
    expect(at({})).toEqual(['d', 'c']);
    expect(at({ direction: -1 })).toEqual(['b', 'c']);
    expect(at({ want: ['e'] })).toEqual(['d', 'e']);
    expect(at({ loadedMs: 1999 })).toEqual(['c']);
    expect(at({ loadedMs: null })).toEqual(['c']);
    expect(at({ restMs: 1500, loadedMs: 9000 })).toEqual(['c']);
  });

  it('never preloads in compare modes, under Save-Data or while a run fetches', () => {
    expect(at({ want: ['b', 'c'], compare: true })).toEqual(['b', 'c']);
    expect(at({ saveData: true })).toEqual(['c']);
    expect(at({ runActive: true })).toEqual(['c']);
  });

  it('keeps at most 3 frames, evicting the least recently used, and never a wanted one', () => {
    expect(at({ pool: ['a', 'e', 'b'], loadedMs: null })).toEqual(['e', 'b', 'c']);
    expect(at({ pool: ['a', 'e', 'b'] })).toEqual(['b', 'd', 'c']);
    // Selecting a mounted frame again makes it the most recent.
    expect(at({ pool: ['c', 'a', 'b'], loadedMs: null })).toEqual(['a', 'b', 'c']);
  });
});
