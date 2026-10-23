# Contributing to Pagelapse

Thanks for helping. Pagelapse is small on purpose: a React + Vite app, a Cloudflare Worker, and pure TypeScript in between. This guide covers the setup, the checks a pull request must pass, and the rules that keep the app calm, accessible and kind to the archives it reads from.

New here? [docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md) lists well-scoped starting points, and [docs/EXTENDING.md](docs/EXTENDING.md) explains the extension points.

## Setup

1. Install [pnpm](https://pnpm.io/installation) 9. It downloads the Node version pinned in `.npmrc` (Node 24) for this project.
2. `pnpm i`
3. `pnpm dev` runs the app and the Worker together (through `@cloudflare/vite-plugin`). No Cloudflare account, login or key is needed. Without Workers AI, summaries are the deterministic "auto summary".

`.dev.vars` is optional and gitignored. Copy `.dev.vars.example` only if you want to bake AI summaries into the samples. Never commit a secret.

## Checks

| Command | What it checks |
|---|---|
| `pnpm lint` | oxlint |
| `pnpm typecheck` | `tsc --noEmit` for the app, the scripts and the Worker |
| `pnpm test` | Vitest, offline (`fetch` is disabled in tests). It includes the design rules (spacing, accent, palette and colour-vision checks) and the docs link check |
| `pnpm build` | the production build |
| `pnpm size` | after a build: JavaScript, CSS, font, sample and picture budgets, and that only React reaches the browser bundle |
| `pnpm smoke` | after a build: user flows, accessibility (axe-core) and layout audits in headless Chrome (`/usr/bin/google-chrome`); `--flows a,b` runs a subset |

`pnpm check` runs lint, typecheck, test and build in one go. CI (`.github/workflows/ci.yml`) runs the same plus `pnpm size`.

## How the code is organised

- `src/core/`: pure logic (extraction, diff, scoring, summaries by rule, timeline). No DOM and no `fetch` (lint enforces it), so it runs in the browser, the Worker and the scripts alike. Its public types and functions are exported from `src/core/index.ts`.
- `src/app/`: the React UI. Keep components thin and move logic into tested pure modules.
- `src/design/`: palette, tokens and CSS.
- `worker/`: the Cloudflare Worker (`/api/*` only).
- `scripts/`: recorders, smoke tests and budget checks. The recorders are the only code that touches the network outside the app.

Write tests next to the code (`*.test.ts`). Prefer small, typed functions with TSDoc on anything exported from `src/core`.

## Design rules: crowding is a bug

Every UI change is reviewed against [docs/DESIGN.md](docs/DESIGN.md), and especially its **Calm layout** rules.

- Each view has exactly one focal point. A change that adds a second one, or pushes the first screen over its caps (regions, tab stops, framed boxes, eyebrow labels, accent fills), **fails review**, however useful the feature. Fold secondary things behind a native `<details>` disclosure instead.
- Spacing uses only the six `--space-*` tokens (`spacing.test.ts` enforces it). There is one accent, ink, and a solid fill is kept for one primary action per view.
- Never rely on colour alone, keep everything keyboard operable with a visible focus ring, and respect `prefers-reduced-motion`. Colours come from `src/design/palette.ts` and must keep passing `palette.test.ts` (contrast and colour-vision deficiency checks).
- Include a screenshot (1440 px wide, light theme) of every UI change in the pull request.

## Samples, pictures and the image budget

The built-in samples are committed so the first view works offline. Re-recording is rarely needed, and it must stay polite:

- `pnpm record:samples [--only <id>]` records the text from an archive's raw captures into `src/samples/<id>.json`. Settings live in `src/samples/samples.config.json`.
- `pnpm record:visuals [--only <id>]` screenshots the same captures in headless Chrome into `public/samples/<id>/` and writes each picture's status into the fixture. One capture at a time, at least 5 s apart, with only the archive's hosts allowed.
- Both cache everything under `.cache/record/` (gitignored), and `--offline` rebuilds from that cache with no network at all. Use `--dry-run` first.
- **Image budget**, checked by `pnpm size` and `src/samples/samples.test.ts`: each full picture (960×600 WebP) at most 64 KB, each thumbnail (320×200) at most 8 KB, all sample pictures together at most 2.2 MB, and the first view's pictures at most 160 KB.
- Samples must be openly licensed and attributed, and stay away from finance topics. Blocks that state monetary figures are trimmed from text and hidden in pictures, and the fixture says so.

## Being kind to the archives

Never add code that hammers the Internet Archive or any other archive. Requests go through `politeFetch` (identified User-Agent, backoff, size cap), at most 2 at a time, and their results are cached. Tests never touch the network (`test/setup/no-network.ts`).

## AI

The model writes one-line change summaries and nothing else (see [where AI is used](README.md#where-ai-is-used-and-where-it-is-not)). A new model call needs a clear user benefit, a deterministic fallback, batching and a cache. The samples and local development must keep working with no key.

## Pull requests

- Keep each pull request focused, and small enough to review in about 20 minutes.
- Fill in the template: what and why, how you tested it, and screenshots for UI changes.
- Dependencies: the browser bundle may contain only React. A new dependency of any kind needs a good reason in the pull request.
- Add a line to the `Unreleased` section of [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.

By contributing you agree that your work is released under the [MIT licence](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
