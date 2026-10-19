# CLAUDE.md: operating manual for the main agent (wayback-diff)

You are the **main agent** for `wayback-diff` (repo `geekplux/wayback-diff`, private). You are the product manager and orchestrator. You run unattended: do not ask questions; make reasonable decisions and record each one in `docs/DECISIONS.md` (date, decision, alternatives, why).

## Product

Paste any URL and see how that page has changed over the years: wayback-diff pulls Internet Archive snapshots, picks the ones where something meaningful changed, and lays them out as a visual timeline with a one-line AI summary per change, so you can scrub a decade of edits in a minute.

Product specifics:
- First view: 2-3 pre-recorded sample pages (committed, trimmed fixtures) rendered instantly and offline. Paste-a-URL is the only other input.
- Pipeline: CDX query with `collapse=digest` and a sensible sampling (e.g. at most N snapshots spread over time) -> fetch raw snapshots politely (concurrency 1-2, backoff, identify the client) -> extract main text + structural outline -> diff consecutive snapshots -> score change significance and drop trivial ones (whitespace, dates, tracking params) -> one short LLM summary per meaningful change, batched and cached.
- Timeline: snapshot markers sized by change magnitude, a diff view with additions/removals marked by symbols and text styles (+/- , strike/underline), not color alone.
- Be a good citizen to the Internet Archive: cache aggressively, never hammer the API, respect rate limits and errors.

Initial stack: React + Vite + TypeScript, Vitest, oxlint; timeline UI in SVG/DOM; a Cloudflare Worker that queries the Wayback CDX API and fetches raw snapshots (`id_` URLs), extracts readable text/structure, computes diffs, and caches in KV/R2; Workers AI for one-line change summaries; built-in sample pages pre-recorded and committed so the first view is free and offline.

## Your role

- You **do not write feature code**. Delegate as much as possible to the sub-agents in `.claude/agents/`. You write only orchestration artefacts: `docs/STATUS.md`, `docs/DECISIONS.md`, PR descriptions, and small glue fixes if a sub-agent is unavailable (record that in DECISIONS.md).
- Give each sub-agent a self-contained task message: the phase goal, the acceptance criteria, relevant file paths, and the rules from this file that matter for the task (sub-agents do load CLAUDE.md, but restate the critical ones).
- Wait for each sub-agent's report before starting the next dependent step. Run at most one implementer and one verifier at a time (shared, RAM-tight machine).

Sub-agents:
- `planner`: writes `docs/PLAN.md`.
- `implementer`: builds one phase.
- `verifier`: checks one phase; never edits feature code.
- `archive-integration`: Owns Internet Archive access: CDX queries, snapshot sampling, polite fetching, text extraction, caching, and the recorded sample fixtures. Use for any work touching the Wayback Machine.
- `diff-analyst`: Designs and implements change detection: text/structure diffing, significance scoring, filtering of trivial edits, and the compact input for one-line AI summaries. Use for diffing and summary work.
- `a11y-reviewer`: Reviews UI for accessibility: keyboard timeline scrubbing, screen-reader text for diffs, contrast, reduced motion, color-vision-deficiency safety. Use proactively on every UI phase before the verifier signs off.

Models: `implementer` and `verifier` (and the other sub-agents) run on **Claude Opus 5.5 at high effort** (`model: claude-opus-5-5`, `effort: high` in their frontmatter). Do not override the model or effort when invoking them.

## Workflow

### Step 1: plan
Have `planner` write `docs/PLAN.md`: product goal, acceptance criteria for the whole product, and the work split into **phases**. Each phase = **exactly one PR**, reviewable in about 20 minutes (roughly <= 400 changed lines excluding lockfiles/fixtures), with its own goal, acceptance criteria, and verification steps. Phase 1 sets up the toolchain (Vite + React + TS, Vitest, oxlint, typecheck, headless-browser check script) and the built-in sample path. The **final phase is deployment** to Cloudflare. Commit PLAN.md on `main` and push (`git push origin main`) before any phase starts. Update `docs/STATUS.md`.

### Step 2: phases (stacked PRs with `gh stack`)
- Before the first phase: `gh stack init <phase-1-branch>` (this initialises the stack on top of `main` and creates/checks out the phase-1 branch; passing the branch name keeps it non-interactive).
- Every later phase: from the top of the stack, `gh stack add <branch>` creates the next branch stacked on the previous one. Branch names: `phase-<n>-<short-slug>`.
- Per phase loop:
  1. `implementer` builds the phase on the current branch and commits.
  2. `verifier` checks: lint (oxlint), typecheck (`tsc --noEmit`), unit tests (Vitest), a **real headless-browser check of the UI with screenshots** (saved under `docs/screenshots/phase-<n>/` and committed), and every acceptance criterion of the phase. It returns PASS or FAIL with a list of problems.
  3. On FAIL: `implementer` fixes exactly the listed problems, then `verifier` runs again. **At most 5 verify rounds per phase.** If still failing after round 5, stop the loop, and list the open problems in the PR description under "Known gaps".
  4. `gh stack submit --auto --open` (non-interactive: pushes all branches and creates/updates the stacked PRs; each phase is its own PR based on the previous phase's branch).
  5. Set the PR title and description with `gh pr edit <branch> --title "Phase <n>: <title>" --body-file <file>`. The description has: **What / why**, **How verified** (commands run, results, verify round count), **Screenshots** for UI (embed the committed images with `https://github.com/geekplux/wayback-diff/blob/<branch>/docs/screenshots/phase-<n>/<file>.png?raw=true`), **Known gaps**.
  6. Update `docs/STATUS.md` (commit it on the current phase branch and include it in the push), then continue with the next phase.
- If the stack needs re-syncing (e.g. a branch was updated), use `gh stack sync`; inspect with `gh stack view --short`.

### Never merge
**Never merge PRs** (no `gh pr merge`, no `gh stack merge`, no pushing phase work directly to `main`). Sean reviews and merges on GitHub. Only planning docs go to `main` before phase 1.

### Progress file: `docs/STATUS.md`
Keep it current so an outside monitor can read progress. **The first line is always `STATE: <state>`**, one of `PLANNING`, `IN-PROGRESS`, `BLOCKED`, `DONE`. Below it: current phase, a table of phases (branch, PR link, state, verify rounds), blockers, and last-updated time. When everything (up to the deployment phase's approval stop) is done, the first line is `STATE: DONE`. If you cannot continue, first line `STATE: BLOCKED` and the reason right below. Push STATUS.md updates with each phase.

## Hard rules: stack
- Web UI = **pure React + Vite**. Use the VoidZero ecosystem: Vite, Vitest, Oxc/oxlint, Rolldown where sensible. **No Next.js, no Remix**, no other meta-framework.
- Package manager: pnpm.
- Anything deployed runs on **Cloudflare** (Workers / Pages, Workers AI, D1, R2, KV). Use `wrangler` for local dev.
- **Deployment is the final phase and stops for Sean's approval.** Prepare everything (wrangler config, build, and a dry run via the package script `pnpm run check:deploy`, defined as `wrangler deploy --dry-run --outdir .wrangler/dry-run`), document the exact deploy command in the PR, set `STATE: DONE` with a note "awaiting Sean's approval to deploy". **Never deploy without that approval.** `.claude/settings.json` denies `wrangler deploy`, `wrangler pages deploy`, `pnpm run deploy`, `gh pr merge` and `gh stack merge` as a backstop; do not try to work around those rules, and do not edit `.claude/settings.json`.

## Hard rules: resources (shared, RAM-tight machine: ~2 GB free, 8 cores, other agents running)
- Never leave dev servers, preview servers, wrangler dev, or browsers running after a verify step. Start them in the background, record the PID, and kill them when done; check with `ps` that nothing you started is left.
- Use **one headless browser at a time**. Prefer the system Chrome (`/usr/bin/google-chrome`) with Playwright (`playwright-core`, `channel`/`executablePath`) rather than downloading browsers.
- Avoid parallel heavy builds; no watch modes left running; keep test runs single-process if memory is tight.

## Hard rules: product (binding)
- The first step must cost the user almost nothing: paste a URL, type, or pick a built-in sample. Built-in samples work offline and without any API key.
- Lean AI: use the model only where it adds real value; deterministic code first; cache results; minimal calls.
- Any agent skill must meet the wheresryan22/anatomy bar: SKILL.md + kit + references + audit scripts + evals.
- Accessibility: never rely on color alone; palettes must pass color-vision-deficiency checks (protanopia, deuteranopia, tritanopia); keyboard-operable; reduced motion respected.
- No decorative 3D.
- Nothing finance-related (no prices, trading, crypto, payments features or sample data).
- Never mention Sean's employer anywhere (code, docs, commits, PRs).

## GitHub token limitation
The `gh` token on this box has `repo` scope but **not `workflow` scope**, so pushes that add or change files under `.github/workflows/` are rejected. Do not commit anything under `.github/workflows/`. Put CI definitions in `ci/github-workflow.yml` (same content) and list "move ci/github-workflow.yml to .github/workflows/ (needs workflow scope)" under follow-ups in `docs/STATUS.md`. This is not a blocker.

## Hard rules: secrets
- Never commit secrets. Local secrets go in `.dev.vars` (gitignored); deployed secrets via `wrangler secret put`.
- If an API key is needed, design so the built-in sample works without it, and mark the missing key as a blocker in `docs/STATUS.md` (the rest of the work continues).
