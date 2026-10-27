# Extending Pagelapse

The main extension points, with the files to touch and the checks that keep them honest. Read [CONTRIBUTING.md](../CONTRIBUTING.md) first for the setup and the rules, and [DESIGN.md](DESIGN.md) before changing anything visible.

## Add a sample (text and pictures)

A sample is a committed fixture (`src/samples/<id>.json`) plus its pictures (`public/samples/<id>/`). It must be openly licensed, have at least 8 distinct captures, tell a visible story (a redesign, a rewritten pitch), and stay away from finance topics.

The options come from `src/samples/samples.config.json`, in its order; the first recorded entry is the default (Wikipedia: Internet Archive). The app offers only entries whose fixture file exists (`import.meta.glob` in `src/samples/index.ts`), so an entry can wait in the config until it is recorded: it is not a hero option or a menu item, and its `?sample=` link opens the default.

1. Add an entry to the config: `id`, `label` (the option shows it without " home page"), `url`, `description`, `maxChars`, `license` (an SPDX id, or a `LicenseRef-` id explained in the attribution) and `attribution`. Optional fields:
   - `dropBlocks`: a regular expression for text blocks to trim (the samples use it to drop monetary figures and donation appeals);
   - `visualRedact`: elements to hide before screenshotting, and the note that says so;
   - `visualDrop`: captures whose picture must not ship (it misrepresents the page, for example unstyled, or it shows a price or a donation amount), marked as no picture with a reason;
   - `featured`: the change a sample other than the default opens on, `"<fromTs>-<toTs>"` (the default opens on its decade compare).
2. Record the text: `pnpm record:samples --only <id> --dry-run`, then without `--dry-run`. `--only` takes a comma-separated list. It reads from the Internet Archive by default; `--archive arquivo-pt` uses Arquivo.pt, which is what the current samples were recorded from.
3. Record the pictures: `pnpm record:visuals --only <id>`. It replays the fixture's captures from Arquivo.pt only, one at a time, and prints each picture's status plus a visual-delta table. Pick `featured` from that table (a meaningful change whose two pictures differ visibly, both pictured and ideally `ok`), set it in the config, and re-run with `--offline` to write it into the fixture without any network.
4. Run `pnpm test` (`samples.test.ts` validates the fixture and its money filter; `scripts/lib/pictures.test.ts` the pictures, their sizes and orphans) and `pnpm build && pnpm size` (the image budget is in [CONTRIBUTING.md](../CONTRIBUTING.md#samples-pictures-and-the-image-budget)).

Both recorders cache everything under `.cache/record/`, so a re-run never refetches a capture.

### Before you commit a new sample

The recorders need network access to the archives and Chrome (`CHROME_PATH` if it is not in its standard place). Run the steps above on such a machine, then:

- **Look at every picture.** Open the sample in `pnpm dev` and step through it: money figures and donation amounts must be hidden or the picture dropped with `visualDrop` (re-run `pnpm record:visuals --only <id> --offline` to apply it), and `partial` or `failed` pictures should still tell the story.
- **The image budget.** All sample pictures together may take 2.2 MB, and the three current samples (Wikipedia, NASA, Creative Commons) use about 1.6 MB, so a fourth sample of the same size will not fit without retiring or trimming one. At least 85% of all captures must have a picture.
- **The credits.** Add the page to the README's Credits and to `public/samples/README.md`.
- **Commit together:** `src/samples/<id>.json`, `public/samples/<id>/` and the config entry (with its `featured` pair and any `visualDrop`). The option appears in config order in the hero and the address menu.

## The summariser interface

A summary is one line about one meaningful change, made from its `ChangeRecord` (`src/core/changeRecord.ts`): the title, headings added, removed and renamed, and clipped snippets of the added and removed text, at most 1,200 characters. A model never sees a page or a picture.

- **Deterministic:** `ruleSummary(record): string` in `src/core/ruleSummary.ts`. It always works, and it is the fallback for everything below.
- **Workers AI:** `summarise(env, url, records, client): Promise<Summary[]>` in `worker/summarise.ts`, where `Summary` is `{ pair, text, source: 'ai' | 'rule' }`. It reads the cache, sends uncached records in batches (`batches()` in `worker/prompt.ts`: up to 8 per call), checks the per-client and daily limits, validates each line (`validLine`) and caches the result per capture pair.
- **Changing the model or the prompt:** edit `MODEL` or the system prompt in `worker/prompt.ts` and bump `PROMPT_VERSION`. Both are part of the cache key, so old summaries are not reused.
- **Another provider:** keep the `summarise` signature and its guarantees: batch, cache per pair, respect the limits, and fall back to `ruleSummary` per item on any failure. The UI labels each line from `source`, so no UI change is needed.
- **Baking summaries into the samples:** `pnpm bake:summaries` uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from `.dev.vars`. Without them it explains what to set and exits.

## Significance tuning

What counts as a meaningful change is decided in three places, all pure and unit-tested:

- `src/core/normalize.ts` masks noise before comparing: whitespace, quotes and dashes, dates and times, page-chrome counters, and tracking, session and cache-buster query parameters.
- `src/core/score.ts` weighs what is left (`WEIGHTS`: headings and title 3, words 1, cosmetic 0.2, moves 0.1) and maps the score to a magnitude (`MAGNITUDE_THRESHOLDS`: minor 0.07, moderate 0.30, major 0.70; below minor is trivial).
- `src/core/__eval__/cases/*.json` is a labelled set of before/after pairs. `eval.test.ts` requires at least 90% agreement and at least 5 cases per magnitude.

To tune: add a case that shows the problem first, then change a mask, weight or threshold until the eval passes again. A mask that hides real changes (a version bump, an edited count) is worse than a little noise.

## Archive sources

Archives are described in `src/archive/archives.ts` (`ARCHIVES`): name, home page, CDX endpoint and dialect (`json` or `ndjson`), replay base, and the frame modifier (`if_` or `mp_`). To add a Wayback-compatible archive:

1. Add its id to `ArchiveId` in `src/core/types.ts` and its descriptor to `ARCHIVES`.
2. If its CDX output is a new dialect, add a parser next to `parseCdxJson` / `parseCdxNdjson` in `src/core/cdx.ts`, with tests.
3. The URL builders in `src/core/url.ts` (`rawCaptureUrl`, `replayFrameUrl`, `viewCaptureUrl`) derive from the descriptor.

The recorders accept the new archive right away. The Worker (`worker/routes/captures.ts`, `worker/routes/snapshot.ts`) and the live pane read only from the Internet Archive today: using another archive live also needs its host added to the frame policy, and a way for users to choose it without crowding the first view. All upstream requests must go through `fetchUpstream` / `politeFetch`.

## Theme tokens

- Colours are Radix sand (neutral), cyan (Before, removed) and amber (After, added, the selected change) in `src/design/palette.ts` (light and dark), mirrored in `src/design/tokens.css`. `palette.test.ts` keeps the two equal and checks text contrast (4.5:1), graphic contrast (3:1), and the separation of Before and After under protanopia, deuteranopia and tritanopia.
- `accent.test.ts` keeps cyan and amber to the places that pair them with a word, a symbol, a ring or a text style. `design.test.ts` keeps the four type sizes (12, 14, 20, 40), the two families and the 0.5px hairlines.
- Spacing uses `--space-1` to `--space-6` (4, 8, 16, 24, 40, 64 px). `spacing.test.ts` fails on any other margin, padding, gap or offset.
- The dark theme follows `prefers-color-scheme` unless the header's theme button stored a choice (`data-theme` on `<html>`); `tokens.css` holds the dark values twice, for both cases, and `palette.test.ts` keeps both equal to `palette.ts`.

## Optional screenshot provider (designed, not built)

Live thumbnails are text outlines, and the live pane shows the Internet Archive's own replay in a frame. A screenshot provider could give live runs real thumbnails. It is designed but not built, and it must stay optional:

- A route `GET /api/shot?url=&ts=` in the Worker, active only when a `BROWSER` binding (Cloudflare Browser Rendering) and a `SHOTS` R2 bucket are configured.
- It renders the archived capture at 1280×800, encodes a 320×200 WebP, and stores it in R2 forever (captures never change). It is rate-limited per visitor and covered by the archive cooldown.
- `/api/health` reports `shots: "browser-rendering"` or `"off"`, and the UI falls back to text outlines when it is off.
- Pictures are served from the same origin, so the content security policy does not change.

Browser Rendering has usage limits and possible costs, which is why the default needs nothing but the free Worker.
