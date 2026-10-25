import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOGO } from './Logo.tsx';

const favicon = readFileSync(new URL('../../public/favicon.svg', import.meta.url), 'utf8');

describe('logo A, Sun path', () => {
  it('the favicon draws the same mark: gradient, tile, five suns, horizon and ground', () => {
    for (const [offset, color] of LOGO.gradient) expect(favicon).toContain(`<stop offset="${offset}" stop-color="${color}"/>`);
    const { x, y, width, height, rx } = LOGO.tile;
    expect(favicon).toContain(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="url(#g)"/>`);
    for (const s of LOGO.suns) expect(favicon).toContain(`<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"/>`);
    expect(favicon).toContain(`<path d="${LOGO.horizon.d}" stroke="${LOGO.horizon.stroke}"`);
    expect(favicon).toContain(`clip-path="${LOGO.ground.clipPath}"`);
  });

  it('the suns arc from dawn cyan to dusk amber, growing as they go', () => {
    expect(LOGO.suns).toHaveLength(5);
    const r = LOGO.suns.map((s) => s.r);
    expect([...r].sort((a, b) => a - b)).toEqual(r);
    expect(LOGO.suns.map((s) => s.cx)).toEqual([...LOGO.suns.map((s) => s.cx)].sort((a, b) => a - b));
  });
});
