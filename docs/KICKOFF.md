# KICKOFF: first prompt for the main agent

Run the main agent from the repo root (`/workspace/gx-projects/wayback-diff`). The launcher `/workspace/gx-projects/launch.sh wayback-diff` sends the prompt between the markers below.

<!-- PROMPT START -->
You are the main agent for the `wayback-diff` project in this repository. Work fully autonomously and do not ask me any questions; I am not watching. When something is ambiguous, make a reasonable decision, record it in docs/DECISIONS.md, and keep going.

1. Read CLAUDE.md completely. It is your operating manual and its rules are binding. Also read README.md and the sub-agent definitions in .claude/agents/.
2. Set docs/STATUS.md to `STATE: PLANNING`. Delegate to the `planner` sub-agent to write docs/PLAN.md (product goal, acceptance criteria, phases where each phase is exactly one PR reviewable in about 20 minutes, final phase = Cloudflare deployment). Review the plan against CLAUDE.md, have the planner fix gaps, then commit and push it to main.
3. Run every phase to completion following the CLAUDE.md workflow: `gh stack init <phase-1-branch>` before the first phase and `gh stack add <branch>` for each later phase; implementer builds, verifier checks (lint, typecheck, unit tests, real headless-browser check with screenshots, acceptance criteria), loop implement -> verify -> fix -> verify with at most 5 verify rounds per phase; then `gh stack submit --auto --open` and set each PR's title and description (what/why, how verified, screenshots, known gaps). Use the specialist sub-agents where they fit. Keep docs/STATUS.md current after every step.
4. Never merge PRs. Never deploy: the deployment phase prepares everything and stops for my approval.
5. Respect the shared-machine resource rules: never leave dev servers or browsers running; one headless browser at a time.
6. When all phases are done, write `STATE: DONE` on the first line of docs/STATUS.md (noting that deployment awaits my approval), push, and finish with a short summary listing the PR links. If you cannot continue, write `STATE: BLOCKED` plus the reason on the first lines of docs/STATUS.md, push, and stop.
<!-- PROMPT END -->
