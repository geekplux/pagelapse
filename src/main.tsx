import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { SampleFixture } from './core/types.ts';
import { App } from './app/App.tsx';
import { isHeroState, parseUrlState } from './app/urlState.ts';
import { workspace } from './app/workspace.ts';
import { firstCaptures } from './app/visual/visualState.ts';
import { changePictures, decodePicture, defaultEntry, sampleFor } from './samples/index.ts';
import './design/tokens.css';
import './design/base.css';
import './design/visual.css';
import './design/live.css';
import './design/hero.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// A deep link opens the workspace: fetch its chunk and its sample first, so the first paint is the workspace, not a
// loading line, and start decoding the pictures it shows first (firstCaptures: the default sample's decade compare,
// the capture shown in Single, or the change's two). The hero renders at once and fetches them later. A failed fetch still renders (the app shows
// it and offers Try again).
const url = parseUrlState(location.search);
const entry = url.url ? undefined : sampleFor(url.sample);
const pictures = (f: SampleFixture) => {
  for (const src of changePictures(f, firstCaptures(f, url, entry === defaultEntry).join('-'))) void decodePicture(src);
};
const ready = isHeroState(url) ? Promise.resolve() : Promise.all([workspace.load(), entry?.load().then(pictures)]).catch(() => undefined);
void ready.then(() =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
