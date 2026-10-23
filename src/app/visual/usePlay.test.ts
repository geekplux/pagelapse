import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAY_MS, createPlayer, stopsPlay } from './usePlay.ts';

describe('createPlayer', () => {
  afterEach(() => vi.useRealTimers());

  it('steps once per 1.2 s, never before, and stops itself at the end', () => {
    vi.useFakeTimers();
    let shown = 0;
    const onStop = vi.fn<() => void>();
    createPlayer(() => ++shown < 3, onStop);
    vi.advanceTimersByTime(PLAY_MS - 1);
    expect(shown).toBe(0);
    vi.advanceTimersByTime(1);
    expect(shown).toBe(1);
    vi.advanceTimersByTime(PLAY_MS * 5);
    expect(shown).toBe(3);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('stops on request, once', () => {
    vi.useFakeTimers();
    const step = vi.fn<() => boolean>(() => true);
    const onStop = vi.fn<() => void>();
    const stop = createPlayer(step, onStop);
    vi.advanceTimersByTime(PLAY_MS * 2);
    stop();
    stop();
    vi.advanceTimersByTime(PLAY_MS * 3);
    expect(step).toHaveBeenCalledTimes(2);
    expect(onStop).toHaveBeenCalledOnce();
  });
});

describe('stopsPlay', () => {
  it('stops on any key or pointer down, except activating the Play button itself', () => {
    expect(stopsPlay({ type: 'keydown', key: 'ArrowRight' }, true)).toBe(true);
    expect(stopsPlay({ type: 'keydown', key: 'Tab' }, false)).toBe(true);
    expect(stopsPlay({ type: 'pointerdown' }, false)).toBe(true);
    expect(stopsPlay({ type: 'keydown', key: ' ' }, true)).toBe(false);
    expect(stopsPlay({ type: 'keydown', key: 'Enter' }, true)).toBe(false);
    expect(stopsPlay({ type: 'pointerdown' }, true)).toBe(false);
  });
});
