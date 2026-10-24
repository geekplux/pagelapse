import { describe, expect, it, vi } from 'vitest';
import { retryableImport } from './workspace.ts';

describe('retryableImport', () => {
  it('imports once and keeps the module', async () => {
    const importer = vi.fn<() => Promise<{ ok: number }>>(() => Promise.resolve({ ok: 1 }));
    const w = retryableImport(importer);
    expect(w.loaded()).toBeUndefined();
    await Promise.all([w.load(), w.load()]);
    expect(await w.load()).toEqual({ ok: 1 });
    expect(w.loaded()).toEqual({ ok: 1 });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed import, so the next load tries again', async () => {
    const importer = vi.fn<() => Promise<{ ok: number }>>().mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValueOnce({ ok: 2 });
    const w = retryableImport(importer);
    await expect(w.load()).rejects.toThrow('chunk failed');
    expect(w.loaded()).toBeUndefined();
    expect(await w.load()).toEqual({ ok: 2 });
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
