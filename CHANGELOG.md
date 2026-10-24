# Changelog

All notable changes to Pagelapse are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pagelapse has not been released yet, so everything so far is under Unreleased.

## [Unreleased]

### Added

- Deploy config for Workers Builds: `wrangler.jsonc` is production only (the `AI` binding moved to the top level and local dev to `wrangler.local.jsonc`, so `pnpm run build` + `npx wrangler deploy` deploys every binding with no environments warning), declares the custom domain `pagelapse.geekplux.com`, and adds a `previews` block (own rate limiters, no production KV, no AI; the Worker falls back to an in-memory cache without `CACHE`). Canonical and Open Graph tags, `robots.txt` and `sitemap.xml`, and the README, examples and launch links now point at https://pagelapse.geekplux.com. `CACHE` is bound to the `PAGELAPSE_CACHE` KV namespace ([docs/DEPLOY.md](docs/DEPLOY.md)).
- Deployment preparation: production Wrangler config, security headers for the static site (a Content Security Policy that allows only the Internet Archive's replay frames), year-long caching for hashed assets and sample pictures, a deploy dry run (`pnpm run check:deploy`) and a deployment guide ([docs/DEPLOY.md](docs/DEPLOY.md)). The site is not deployed yet.
- A showcase: the first view opens on the default sample's decade compare (its first capture against its latest), an [examples gallery](examples/README.md) with deep links, a social preview image, a hero GIF and launch drafts ([docs/LAUNCH.md](docs/LAUNCH.md)).
- Open-source packaging: a new README, CONTRIBUTING, Code of Conduct (Contributor Covenant 2.1), security policy, issue and pull request templates, design notes ([docs/DESIGN.md](docs/DESIGN.md)), an extension guide ([docs/EXTENDING.md](docs/EXTENDING.md)), good first issues, and a docs link check that runs with the tests.
- A calm layout: one focal point per view, secondary details folded behind native disclosures, one spacing scale and one ink accent, all checked by tests and a layout audit.
- One-line summaries of each meaningful change: Workers AI on a deployment (batched, cached per pair of captures, capped per day) with a labelled deterministic fallback.
- Live pictures: the Internet Archive's own replay of the selected capture in a sandboxed frame, loaded only when you rest on a capture, with text-outline thumbnails.
- Live mode: paste any URL to look it up in the Internet Archive, with progress, Cancel, and clear empty and error states.
- A Cloudflare Worker API for captures, extracted pages and summaries, with caching, per-visitor rate limits and a global cooldown when the archive asks to slow down.
- Compare modes (Slider, Side by side, Single) and a pausable time-lapse Play. Onion skin was removed in the redesign; an old `view=onion` link opens Slider.
- The visual pane: what each sample capture looked like, from committed screenshots.
- The Pagelapse name, mark and wordmark.
- A diff view with `+` / `−` / `~` symbols, underline and strike-through. In the redesign it sits beside the change (its two captures, summary and source, words, new, gone and renamed sections, and archive links), shows a long diff's first changes with "Show n more changes", and an "Every change" table lists every change, newest first.
- A time ribbon: a thumbnail per capture joined by a hairline to its date on a year axis, a bar per change sized by how much changed, and keyboard and drag scrubbing. It replaced the earlier filmstrip and timeline in the redesign; the list of changes is now the "Every change" table under the diff.
- Change detection: readable-text extraction, a word-level diff, significance scoring and a trivial-edit filter (whitespace, dates, counters, tracking parameters), tuned against an evaluation set.
- Three built-in samples (git-scm.com, Wikipedia "Internet Archive" and rust-lang.org), recorded from Arquivo.pt and committed so the first view works offline.
- The design system: the "archivist's proof sheet" palette and type, checked for contrast and colour-vision deficiencies.
- The toolchain: React, Vite, TypeScript, Vitest, oxlint, headless-browser smoke tests, and size budgets.

### Fixed

- The automatic summary no longer reports a section rename when one side is a number, a date or a count (on the Wikipedia sample, comparing the first capture with the latest read `Renamed section "40" to "2024 cyberattacks"`).

[Unreleased]: https://github.com/geekplux/pagelapse/commits/main
