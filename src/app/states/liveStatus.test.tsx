import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SheetHead } from '../SheetHead.tsx';
import { LoadingStatus } from './LoadingStatus.tsx';

const caps = ['20131106000000', '20251218000000'];
const head = (status: Parameters<typeof LoadingStatus>[0], shown = status.shown) =>
  renderToStaticMarkup(<SheetHead id="h" title="git-scm.com" captures={caps} changes={9} trivial={4} failed={2} status={<LoadingStatus {...status} />} statusShown={shown} />);
const run = { running: true, shown: true, progress: [9, 14] as const, onCancel: () => {} };

describe('a live run\'s status in the meta line\'s place (target/V1Live.html)', () => {
  it('running: the status shows (text, n of N, the bar, Cancel); the meta line is laid out but hidden', () => {
    const out = head(run);
    expect(out).toContain('<div class="sheet-meta-box"><p class="sheet-meta" aria-hidden="true">');
    // The slow text shares the reading text's cell, hidden, so the count after them keeps its place when it switches.
    expect(out).toContain('<span class="live-text" tabindex="-1"><span>Reading captures from the Internet Archive</span><span aria-hidden="true">The Internet Archive is slow right now</span></span>');
    expect(out).toContain('<span class="live-count mono"><b class="num">9</b> of 14</span>');
    expect(out).toContain('style="transform:scaleX(0.6428571428571429)"');
    expect(out).toContain('<button type="button" class="btn-link live-act">Cancel</button>');
    expect(out).not.toContain('·');
  });

  it('done: the meta line shows (with the captures not fetched); the status stays laid out, hidden, with no button', () => {
    const out = head({ ...run, running: false, shown: false, progress: [14, 14] });
    expect(out).toContain('<p class="sheet-meta">');
    expect(out).toContain('<b class="num">2</b> captures not fetched');
    expect(out).toContain('<div class="live-status" aria-hidden="true">');
    expect(out).not.toContain('<button');
  });

  it('stopped: how far it got and Start again, no count or bar', () => {
    const out = head({ ...run, running: false, stopped: 'Stopped after 6 of 14 captures.', onRetry: () => {} });
    expect(out).toContain('>Stopped after 6 of 14 captures.</span>');
    expect(out).toContain('>Start again</button>');
    expect(out).not.toContain('live-bar');
  });

  it('before the capture list: the count keeps its place, hidden', () => {
    expect(head({ ...run, progress: [0, 0] })).toContain('<span class="live-count mono" data-empty="true">');
  });

  it('a sample has no status box', () => {
    const out = renderToStaticMarkup(<SheetHead id="h" title="t" captures={caps} changes={1} trivial={0} sample />);
    expect(out).not.toContain('sheet-meta-box');
    expect(out).toContain('<span class="tag">Sample</span>');
  });
});
