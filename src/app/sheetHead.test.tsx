import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SheetHead } from './SheetHead.tsx';

const head = (title: string) => renderToStaticMarkup(<SheetHead id="h" title={title} captures={[]} changes={0} trivial={0} />);

describe('sheet title', () => {
  it('lets a host break after its dots, not mid-word', () => {
    expect(head('creativecommons.org')).toContain('<h2 id="h">creativecommons.<wbr/>org</h2>');
    expect(head('www.nasa.gov')).toContain('<h2 id="h">www.<wbr/>nasa.<wbr/>gov</h2>');
  });

  it('leaves a title without dots as one word', () => {
    expect(head('Wikipedia: Internet Archive')).toContain('<h2 id="h">Wikipedia: Internet Archive</h2>');
  });
});
