STATE: IN-PROGRESS

# Status: Pagelapse

- Current phase: 18 verified; PR being opened
- Blockers: none blocking. Non-blocking: Workers AI token for baking sample summaries (optional; `pnpm bake:summaries` with `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` in `.dev.vars`). Samples show rule-based "auto summary" until then.

| Phase | Branch | PR | State | Verify rounds |
|---|---|---|---|---|
| 1 | phase-1-toolchain-sample | [#1](https://github.com/geekplux/pagelapse/pull/1) | PR open (PASS) | 1 |
| 2 | phase-2-design-shell | [#2](https://github.com/geekplux/pagelapse/pull/2) | PR open (PASS) | 1 |
| 3 | phase-3-extract | [#4](https://github.com/geekplux/pagelapse/pull/4) | PR open (PASS) | 2 |
| 4 | phase-4-recorder-samples | [#5](https://github.com/geekplux/pagelapse/pull/5) | PR open (PASS) | 1 |
| 5 | phase-5-diff-engine | [#6](https://github.com/geekplux/pagelapse/pull/6) | PR open (PASS) | 2 |
| 6 | phase-6-significance | [#7](https://github.com/geekplux/pagelapse/pull/7) | PR open (PASS) | 1 |
| 7 | phase-7-timeline-ui | [#8](https://github.com/geekplux/pagelapse/pull/8) | PR open (PASS) | 1 |
| 8 | phase-8-diff-view | [#9](https://github.com/geekplux/pagelapse/pull/9) | PR open (PASS) | 1 |
| 9 | phase-9-rename-pagelapse | [#10](https://github.com/geekplux/pagelapse/pull/10) | PR open (PASS) | 1 |
| 10 | phase-10-sample-pictures | [#11](https://github.com/geekplux/pagelapse/pull/11) | PR open (PASS) | 1 |
| 11 | phase-11-visual-pane | [#12](https://github.com/geekplux/pagelapse/pull/12) | PR open (PASS) | 3 |
| 12 | phase-12-compare-play | [#13](https://github.com/geekplux/pagelapse/pull/13) | PR open (PASS) | 1 |
| 13 | phase-13-worker-archive-api | [#14](https://github.com/geekplux/pagelapse/pull/14) | PR open (PASS) | 2 |
| 14 | phase-14-live-mode | [#15](https://github.com/geekplux/pagelapse/pull/15) | PR open (PASS) | 1 |
| 15 | phase-15-live-visual | [#16](https://github.com/geekplux/pagelapse/pull/16) | PR open (PASS) | 2 |
| 16 | phase-16-ai-summaries | [#17](https://github.com/geekplux/pagelapse/pull/17) | PR open (PASS) | 1 |
| 17 | phase-17-calm-polish | [#18](https://github.com/geekplux/pagelapse/pull/18) | PR open (PASS) | 2 |
| 18 | phase-18-oss-packaging | (opening) | verified PASS | 1 |
| 19 | phase-19-showcase-launch | - | not started | 0 |
| 20 | phase-20-deploy | - | not started | 0 |

Follow-ups:
- Turn on GitHub private vulnerability reporting for geekplux/pagelapse (SECURITY.md relies on it).
- After deploy: confirm web.archive.org allows `if_` replay in a frame (`curl -sI`), see phase 20.
- Re-record built-in samples from the Internet Archive on a machine that can reach web.archive.org (this box cannot; samples recorded via arquivo.pt, see D12).
- Record a real Internet Archive CDX listing for `test/fixtures/api/` (current one is synthetic; IA unreachable from this box).
- Move ci/github-workflow.yml to .github/workflows/ (needs workflow scope).

Last updated: 2026-10-21 (phase 18 verified)
