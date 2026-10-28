# Architecture

Pagelapse is a React app, a pure TypeScript core and one Cloudflare Worker. The app shows the time-lapse, the core decides what changed, and the Worker reads the Internet Archive. This page explains how the parts fit together and why they are shaped this way. [CONTRIBUTING.md](../CONTRIBUTING.md) covers the setup and the checks, and [EXTENDING.md](EXTENDING.md) the extension points.

## The parts

| Path | What it holds | Runs in |
|---|---|---|
| `src/core/` | Text extraction, CDX parsing and sampling, noise masking, the diff, scoring, change records, rule summaries and the timeline model. No DOM and no network access. The public API is `src/core/index.ts` | browser, Worker, scripts |
| `src/archive/` | Archive descriptors (Internet Archive, Arquivo.pt) and `politeFetch`, the HTTP client for archives | Worker, scripts |
| `src/app/` | The React UI: the hero deck, the workspace (stage, controls, time ribbon, change section, every change) and live mode | browser |
| `src/design/` | Palette, tokens, CSS, the logo and the colour-vision maths | browser, tests |
| `src/samples/`, `public/samples/` | The built-in samples: recorded text fixtures, the registry, and one content-hashed WebP picture per capture | browser, scripts |
| `worker/` | The `/api/*` routes (`captures`, `snapshot`, `summaries`, `gallery`, `health`), caching, limits and the summariser | Cloudflare Worker |
| `scripts/` | The sample recorders, the headless smoke runner, the size and docs checks, and the image renderers | Node 24 |

```text
+------------------------ browser ------------------------+
| React app (src/app)  -->  pure core (src/core)          |
|   hero, workspace,          diff, score, timeline       |
|   live mode            sample fixtures and pictures     |
+-----------+----------------------------------+----------+
            | /api/* (same origin)             | sandboxed frame
            v                                  v
+----- Worker (worker/) -------+      +-- Internet Archive --+
| captures: CDX, sample 16     | ---> | CDX API              |
| snapshot: fetch, extract     | ---> | raw captures (id_)   |
| summaries: KV + Workers AI   |      | replay (if_)         |
| KV cache, limits, cooldown   |      +----------------------+
+------------------------------+
```

## How data flows

- **Samples.** A sample is a committed fixture (`src/samples/<id>.json`) with the extracted text of each capture, and a picture per capture in `public/samples/<id>/`. The browser builds the timeline from the fixture with the same core code a live run uses. Nothing touches the network, and summaries are rule-based.
- **Live run.** The browser asks `GET /api/captures` for the page's sampled captures, then `GET /api/snapshot` for each capture's extracted text, 2 at a time. Captures join the timeline in time order as they arrive (`appendSnapshot` in `src/core/timeline.ts`), each diffed against the last meaningful capture, so slow drift still surfaces. Summaries for the meaningful changes are asked for in small batches as they are found (`POST /api/summaries`).
- **Pictures.** Sample pictures are static files. A live picture is the Internet Archive's own replay of the selected capture, which the browser loads into a sandboxed, inert frame. Live thumbnails are text outlines drawn from the extracted page. The Worker never proxies archived pages.

## Decisions that shaped it

- **Recently explored.** After a live run a visitor may press "Add to Recently explored". `POST /api/gallery` checks that the page's captures are already cached, then stores a small entry as the metadata of a KV key whose name sorts newest first, so `GET /api/gallery` is one KV list and no reads. The hero loads the list, and the sample thumbnails, only when the gallery scrolls into view. Opening an entry is an ordinary live run that finds everything in the cache.
- **One Worker with static assets.** Workers Static Assets serves the app, the fonts and the sample pictures, and only `/api/*` runs the Worker (`run_worker_first` in `wrangler.jsonc`). Opening a sample costs no Worker request. `@cloudflare/vite-plugin` builds both halves and runs the Worker in workerd for `pnpm dev` and `pnpm preview`, so local runs behave like production.
- **A pure, shared core.** `src/core/` uses no DOM and no `fetch`, and lint enforces it (`.oxlintrc.json`). The same extraction, diff and scoring run in the browser, the Worker and the recorders. Code that needs IO (the Worker routes, `politeFetch`) takes it as a parameter, so tests pass a fake instead of patching globals.
- **Extract in the Worker, diff in the browser.** The Worker caches the extracted text of a capture, never its raw HTML, so cache values stay small and Worker calls stay short. The browser diffs for display. The summaries route takes only capture pairs and rebuilds each change record from KV, so a client cannot send its own text to the model or poison the summary cache.
- **The extractor stays out of the browser.** `src/core/extract.ts` uses htmlparser2 and is not exported from `src/core/index.ts`. `pnpm size` fails if htmlparser2, or any package other than React, reaches a client chunk. Extraction is capped (2 MB per response, 400 blocks, 30,000 characters, a nesting limit), so odd pages cannot use up the Worker's CPU.
- **An in-house diff.** `src/core/myers.ts` is Myers' algorithm with an edit-distance cutoff, used on blocks and then on words. It adds no dependency and gives control over tokens (one per CJK character) and CPU time. Reworded blocks are paired by word overlap, and moved blocks are detected.
- **Few, well-chosen captures.** The CDX query keeps at most one capture per month and drops identical ones. The Worker then samples 16 captures (24 at most) across the whole range, preferring captures whose size changed. That finds likely edits without extra requests to the archive.
- **Explainable significance.** Noise (whitespace, dates, counters, tracking parameters) is masked first (`normalize.ts`). The rest is weighted (headings and title 3, words 1, case or version-number edits 0.2, moves 0.1) and mapped to a magnitude (`score.ts`). Every score comes with its reasons, and a labelled eval set must agree at least 90% of the time.
- **AI writes one line, nothing else.** The model sees a compact change record (at most 1,200 characters), never a page or a picture. Up to 8 changes go in one call, each capture pair is summarised once and cached for good, and per-visitor and daily caps apply (`DAILY_CAP` in `worker/summarise.ts`). Any failure falls back to the rule summary, which always works, so the samples and local development need no key.
- **Polite to the archive by construction.** Every request the Worker and the text recorder send to an archive goes through `politeFetch`: an identified User-Agent, backoff on server errors and a size cap. In the Worker a 429 is not retried: it starts a cooldown of at least 60 seconds for every visitor, and every archive failure is logged (docs/DEPLOY.md, Logs). A live frame loads only after the selection has rested for 400 ms, at most 3 frames stay mounted, and nothing preloads while a run is fetching.
- **KV and HTTP caching only.** Values are small and captures never change, so KV is enough: CDX listings are refreshed after a day but kept for good, and an old listing is served when the archive refuses or fails, so a page looked up once keeps opening; extracted captures and summaries are kept for good. `EXTRACTOR_VERSION` and `PROMPT_VERSION` are part of the keys, so bumping one invalidates old entries. Branch previews have no KV binding and use a small in-memory cache instead.
- **State in the address, no extra libraries.** The shareable state (`sample` or `url`, `change`, `at`, `view`) lives in the query string (`src/app/urlState.ts`), and components keep the rest in React state. There is no router and no state library, and the browser bundle contains only React.

## Extending it

[EXTENDING.md](EXTENDING.md) has the steps for adding a sample, changing the summariser or its prompt, tuning significance, adding an archive and changing theme tokens. In short: put logic in a pure, tested module in `src/core/`, keep components thin, send every upstream request through `politeFetch`, and check UI changes against [DESIGN.md](DESIGN.md).

## Where the tests live

- Unit tests sit next to the code as `*.test.ts` and `*.test.tsx` in `src/`, `worker/` and `scripts/`. Vitest runs them in Node, and `test/setup/no-network.ts` makes any real `fetch` fail.
- `src/core/__eval__/` holds the labelled before and after pairs for significance scoring.
- `worker/*.test.ts` run the real handlers with a fake KV, a fake rate limiter and a recorded fetch.
- `src/design/*.test.ts` enforce the design rules: palette contrast and colour-vision separation, the four type sizes, the spacing tokens and the 0.5px lines.
- `scripts/check-docs.test.ts` checks the links in the docs and the issue forms, and `scripts/deploy-config.test.ts` checks the Wrangler config, the headers and the Content Security Policy.
- `test/fixtures/` has the HTML pages, the API listing and the replay stub the tests and smoke flows use.
- `pnpm smoke` drives the built app in headless Chrome (user flows, axe-core, layout caps). It is not part of `pnpm test`, and CI runs it only when started by hand.
