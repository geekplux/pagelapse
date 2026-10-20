# Decisions

Record every non-trivial decision here: date, decision, alternatives considered, why.

| Date | Decision | Alternatives | Why |
|---|---|---|---|
| 2026-10-19 | Adopt docs/PLAN.md (14 phases) as written by `planner`, without a revision round | Ask planner to compress to 9-12 phases | Main-agent review against CLAUDE.md (incl. North star) found no gaps; merging phases would exceed the ~400-line review budget |
| 2026-10-19 | Commit Sean's uncommitted CLAUDE.md "North star" edit to `main` together with the plan | Leave it uncommitted | It is a planning/instructions doc; phase branches must carry the same rules |
| 2026-10-19 | D1: one Worker + Workers Static Assets via `@cloudflare/vite-plugin`, `run_worker_first: ["/api/*"]` | Pages + Functions; separate API Worker | Single deployable; dev/preview mirror prod |
| 2026-10-19 | D2: pin Node 24 via pnpm `use-node-version` (box has Node 20.19) | Pin older Vitest/wrangler supporting Node 20 | Current Vitest/wrangler need Node >= 22; nodejs.org reachable |
| 2026-10-19 | D3: TypeScript 7 (native tsc), three tsconfigs; fall back to 5.9 if a tool breaks | TS 5.9 | Fast, low-RAM typecheck |
| 2026-10-19 | D4: `htmlparser2` SAX extractor shared by Worker and recorder | HTMLRewriter, linkedom, DOMParser | One implementation in every runtime, small |
| 2026-10-19 | D5: in-house Myers diff with edit-distance cutoff | jsdiff | Zero runtime deps; control over tokenisation/CPU |
| 2026-10-19 | D6: extraction in Worker (cache extracted text, never raw HTML); diff in browser for display and in Worker for AI input | All server / all client | Short Worker calls; AI endpoint can't be abused as a free LLM |
| 2026-10-19 | D7: CDX `collapse=timestamp:6&collapse=digest`, status 200, text/html | `collapse=digest` only | Bounds result size on busy pages |
| 2026-10-19 | D8: sample 16 captures by default (max 24), time buckets preferring size deltas | Uniform spacing; fetch all | Finds change points with no extra requests |
| 2026-10-19 | D9: KV only for caching (+ HTTP cache) | R2, D1 | Values small, immutable keys |
| 2026-10-19 | D10: Workers AI model `@cf/meta/llama-3.2-3b-instruct` | 1b (weaker), 8b (costlier) | Adequate for one-liners from compact records |
| 2026-10-19 | D11: missing/failed AI binding => rule summaries; move `ai` binding to `env.production` if it forces login in dev | Always-remote AI in dev | Dev/preview/verify must work with no login/key |
| 2026-10-19 | D12: record samples via arquivo.pt (pywb CDX + `id_`) with honest provenance; follow-up to re-record from IA | Hand-made fixtures; WebFetch | Main agent confirmed `web.archive.org` TLS fails from this box while arquivo.pt returns 200 |
| 2026-10-19 | D13: samples = Wikipedia "Internet Archive" (default), git-scm.com, WHATWG FAQ | python.org, gnu.org | Not finance, not company-tied, permissive licences, long histories |
| 2026-10-19 | D14: self-hosted Fraunces subset (<= 60 KB) + system stacks | System only; font CDN | Distinctive identity, offline |
| 2026-10-19 | D15: Worker tests as plain Vitest with fake Env | vitest-pool-workers | RAM |
| 2026-10-19 | D16: no agent skill / CLI shipped | Claude skill; npm CLI | Anatomy bar not worth meeting before the web app proves itself; roadmap item |
| 2026-10-19 | D17: 400-line budget excludes lockfile, fixtures, eval cases, screenshots, fonts, generated images, verbatim licence texts | Count everything | Matches CLAUDE.md intent |
