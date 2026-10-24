import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { isHeroState, parseUrlState } from './app/urlState.ts';
import { workspace } from './app/workspace.ts';
import './design/tokens.css';
import './design/base.css';
import './design/visual.css';
import './design/live.css';
import './design/hero.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// A deep link opens the workspace: fetch its chunk first, so the first paint is the workspace, not a loading line.
// The hero renders at once and fetches it later. A failed fetch still renders (the app shows it and offers Try again).
const ready = isHeroState(parseUrlState(location.search)) ? Promise.resolve() : workspace.load().catch(() => undefined);
void ready.then(() =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
