# CLAUDE.md

A short guide for maintainers and coding agents working on this repository.

## What Pagelapse is

Pagelapse shows how a web page looked and changed over the years. Paste a URL: a Cloudflare Worker reads the page's Internet Archive captures, the app keeps the ones where something meaningful changed and lays them out as a time-lapse, with a word-level diff and a one-line summary per change. Six built-in samples ship with the app and work offline, and the live site is https://pagelapse.geekplux.com.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code fits together, [CONTRIBUTING.md](CONTRIBUTING.md) for the setup and the checks, [docs/DESIGN.md](docs/DESIGN.md) before any UI change, and [docs/DEPLOY.md](docs/DEPLOY.md) for hosting.

## Stack and commands

React 19, Vite 8, TypeScript 7, Vitest, oxlint and pnpm 9 (it fetches the Node 24 pinned in `.npmrc`). One Cloudflare Worker with Workers Static Assets, KV, Rate Limiting and Workers AI, built and run through `@cloudflare/vite-plugin`.

```sh
pnpm dev               # app and Worker locally (wrangler.local.jsonc: no AI, no login)
pnpm lint              # oxlint
pnpm typecheck         # tsc --noEmit for the app, the scripts and the Worker
pnpm test              # Vitest, offline; includes the design rules and the docs link check
pnpm build             # production build into dist/
pnpm size              # after a build: JS, CSS, font, sample and picture budgets
pnpm check:docs        # every relative link and anchor in the docs resolves
pnpm run check:deploy  # wrangler deploy --dry-run --outdir .wrangler/dry-run
pnpm check             # lint, typecheck, test and build
pnpm smoke             # after a build: user flows, axe-core and layout audits in headless Chrome
pnpm preview           # serve the production build on port 4173
```

Maintenance scripts that need the network or Chrome: `pnpm record:samples`, `pnpm record:visuals`, `pnpm bake:summaries`, `pnpm prewarm`, `pnpm render:social` and `pnpm render:gif` (see CONTRIBUTING.md and docs/EXTENDING.md).

## Rules

- Pure React + Vite with the VoidZero tools (Vite, Vitest, oxlint, Rolldown where sensible). No Next.js, no Remix, no other meta-framework. Use pnpm.
- Everything deployed runs on Cloudflare (Workers, Static Assets, KV, Workers AI).
- Deployment happens only through Workers Builds on merge to `main`. Never run `wrangler deploy`; the dry run `pnpm run check:deploy` is fine. Merging is the maintainer's call, so a merged pull request is a deploy.
- `.claude/settings.json` denies `wrangler deploy`, `wrangler pages deploy`, `pnpm run deploy` (and their variants), `gh pr merge`, `gh stack merge` and force pushes to `main`. Do not work around it, and do not edit it.
- Never merge pull requests. The maintainer reviews and merges them on GitHub.
- Never commit secrets. Local ones go in `.dev.vars` (gitignored), deployed ones through `wrangler secret put`. Pagelapse itself needs none.
- The built-in samples work offline and without any key, and tests never touch the network.
- Lean AI: deterministic code first. The model writes only the one-line change summaries: batched, cached per capture pair, limited per visitor and capped per day (`DAILY_CAP` in `worker/summarise.ts`), with a rule-based fallback.
- Be kind to the archives: upstream requests go through `politeFetch`, at most 2 at a time, and everything is cached.
- Accessibility: never rely on colour alone; palettes pass protanopia, deuteranopia and tritanopia checks; everything is keyboard operable; reduced motion is respected.
- UI changes follow the binding rules and the calm layout caps in docs/DESIGN.md. The design tests enforce most of them.
- No decorative 3D. Nothing finance-related (no prices, trading, crypto, payments features or sample data).
- No company names in project content, samples, docs, commits or PRs, apart from tools, services and cited sources.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, build and size on every push to `main` and every pull request. Keep it in step with the checks contributors run locally.
- Record design and behaviour decisions in the pull request description.
