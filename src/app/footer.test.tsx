import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseSampleFixture } from '../core/fixture.ts';
import nasa from '../samples/nasa.json';
import { AppFooter } from './AppFooter.tsx';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const CAP = 'Live AI summaries are capped per day; samples always work.';

describe('footer', () => {
  it('says once, in the source line, that live AI summaries are capped per day (hero, sample and live)', () => {
    for (const html of [renderToStaticMarkup(<AppFooter hero />), renderToStaticMarkup(<AppFooter sample={parseSampleFixture(nasa)} />), renderToStaticMarkup(<AppFooter />)]) {
      const line = /<p class="foot-line">(.*?)<\/p>/s.exec(html)![1]!;
      expect(text(line)).toMatch(/Source on GitHub Live AI summaries are capped per day; samples always work\.$/);
      expect(line).toContain(`<span class="foot-cap">${CAP}</span>`);
      expect(text(html).split(CAP)).toHaveLength(2);
      expect(html).not.toContain('·');
    }
  });
});
