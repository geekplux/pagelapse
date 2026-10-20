/** One step of an edit script: keep an item, delete one from `a`, or insert one from `b`. */
export type EditOp = 'equal' | 'del' | 'ins';

/**
 * Myers' O(ND) shortest edit script turning `a` into `b` (items compared with `===`).
 * Common prefix and suffix are trimmed first. Returns null when more than
 * `maxEditDistance` insertions plus deletions would be needed, so callers can fall back
 * to a coarse replacement instead of spending O(D^2) time and memory.
 */
export function myersDiff<T>(a: readonly T[], b: readonly T[], maxEditDistance = Infinity): EditOp[] | null {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const n = a.length - pre - suf;
  const m = b.length - pre - suf;
  const max = Math.min(n + m, maxEditDistance);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds diagonals -d-1..d+1 of v as it was before step d.
  const trace: Int32Array[] = [];
  const down = (vd: (k: number) => number, k: number, d: number) => k === -d || (k !== d && vd(k - 1) < vd(k + 1));
  let done = false;
  for (let d = 0; d <= max && !done; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d && !done; k += 2) {
      let x = down((i) => v[off + i]!, k, d) ? v[off + k + 1]! : v[off + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[pre + x] === b[pre + y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      done = x >= n && y >= m;
    }
  }
  if (!done) return null;
  const mid: EditOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const t = trace[d]!;
    const at = (k: number) => t[k + d + 1]!;
    const k = x - y;
    const prevK = down(at, k, d) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    for (; x > prevX && y > prevY; x--, y--) mid.push('equal');
    if (d > 0) mid.push(x === prevX ? 'ins' : 'del');
    x = prevX;
    y = prevY;
  }
  const eq = (count: number): EditOp[] => Array.from({ length: count }, () => 'equal');
  return [...eq(pre), ...mid.reverse(), ...eq(suf)];
}
