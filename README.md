# Pagelapse

See how any web page looked and changed over the years. Paste a URL and Pagelapse pulls web archive captures, keeps the ones where something meaningful changed, and lays them out as a time-lapse you can scrub: what the page looked like at each capture, a before/after compare, and a one-line summary of each change. A decade of edits in a minute.

**Status:** planning

**Stack:** React + Vite + TypeScript, Vitest, oxlint; timeline UI in SVG/DOM; a Cloudflare Worker that queries the Wayback CDX API and fetches raw snapshots (`id_` URLs), extracts readable text/structure, computes diffs, and caches in KV/R2; Workers AI for one-line change summaries; built-in sample pages pre-recorded and committed so the first view is free and offline.

## How this repo is built

This repository is developed by a Claude Code main agent acting as product manager, delegating to the specialist sub-agents in `.claude/agents/`. See `CLAUDE.md` for the operating manual, `docs/KICKOFF.md` for the start prompt, `docs/PLAN.md` for the plan (once written), and `docs/STATUS.md` for live progress. Work lands as a stack of pull requests, one per phase; nothing is merged without review.
