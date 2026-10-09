---
name: run-plan
description: "Use when the user invokes it to run a plan's unlanded tasks in headless sessions, one task per process. Not for a plan built inside this session, which build owns, or a plan not yet written, which spec owns."
---

# Run a plan headless

Start the cheap loop on one plan: each unlanded task runs in a fresh `claude -p` process, then one verify process, no context carried between tasks. The enemy is a session that builds tasks itself while the script runs, so two writers race on one branch. The overcorrection is a session that adds flags or retries the script never asked for.

## Run

Terminal route → `exo run [plan]`, installed once by `setup`.

1. Argument `setup` → run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/exo-cli.mjs" setup`, report its output, stop.
   - Else argument → one plan path; none → ask for it, run nothing.
2. Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/run-plan.mjs" <plan>` with Bash `run_in_background`; the run outlasts one foreground call.
3. Pass only flags the user typed; the script holds the defaults.
4. Exit → report its last `run-plan: stop:` line and the summary path it prints. Exit 0 = done, gate passing; 1 = any other stop; 2 = refusal.

## Judgment

- While it runs → touch no task, branch or file the script owns.
- Sessions → sandboxed: writes only inside the repo, no network; land-task is the one command run outside the sandbox.
- Exit 1 or 2 → report the stop line; rerun only when the user asks.
- In-session loop wanted → official `/ralph-loop` plugin still works beside exo, which adds no Stop hook; this skill and `exo run` start a fresh session per task.
