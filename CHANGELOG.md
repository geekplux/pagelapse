# Changelog

All notable changes to Pagelapse are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pagelapse has not been released yet, so everything so far is under Unreleased.

## [Unreleased]

### Added

- Deployment preparation: production Wrangler config, security headers for the static site (a Content Security Policy that allows only the Internet Archive's replay frames), year-long caching for hashed assets and sample pictures, a deploy dry run (`pnpm run check:deploy`) and a deployment guide ([docs/DEPLOY.md](docs/DEPLOY.md)). The site is not deployed yet.
- A showcase: the first view opens on the default sample's decade compare (its first capture against its latest), an [examples gallery](examples/README.md) with deep links, a social preview image, a hero GIF and launch drafts ([docs/LAUNCH.md](docs/LAUNCH.md)).
- Open-source packaging: a new README, CONTRIBUTING, Code of Conduct (Contributor Covenant 2.1), security policy, issue and pull request templates, design notes ([docs/DESIGN.md](docs/DESIGN.md)), an extension guide ([docs/EXTENDING.md](docs/EXTENDING.md)), good first issues, and a docs link check that runs with the tests.
- A calm layout: one focal point per view, secondary details folded behind native disclosures, one spacing scale and one ink accent, all checked by tests and a layout audit.
- One-line summaries of each meaningful change: Workers AI on a deployment (batched, cached per pair of captures, capped per day) with a labelled deterministic fallback.
- Live pictures: the Internet Archive's own replay of the selected capture in a sandboxed frame, loaded only when you rest on a capture, with text-outline thumbnails.
- Live mode: paste any URL to look it up in the Internet Archive, with progress, Cancel, and clear empty and error states.
- A Cloudflare Worker API for captures, extracted pages and summaries, with caching, per-visitor rate limits and a global cooldown when the archive asks to slow down.
- Compare modes (Slider, Side by side, Onion skin, Single) and a pausable time-lapse Play.
- The visual pane and filmstrip: what each sample capture looked like, from committed screenshots.
- The Pagelapse name, mark and wordmark.
- A diff view with `+` / `−` symbols, underline and strike-through, plus heading changes.
- A timeline of captures with marks sized by how much changed, keyboard scrubbing, and a list of all changes.
- Change detection: readable-text extraction, a word-level diff, significance scoring and a trivial-edit filter (whitespace, dates, counters, tracking parameters), tuned against an evaluation set.
- Three built-in samples (git-scm.com, Wikipedia "Internet Archive" and rust-lang.org), recorded from Arquivo.pt and committed so the first view works offline.
- The design system: the "archivist's proof sheet" palette and type, checked for contrast and colour-vision deficiencies.
- The toolchain: React, Vite, TypeScript, Vitest, oxlint, headless-browser smoke tests, and size budgets.

[Unreleased]: https://github.com/geekplux/pagelapse/commits/main
