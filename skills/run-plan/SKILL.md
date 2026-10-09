---
name: run-plan
description: Use when the user invokes it to run a plan's unlanded tasks in headless sessions, one task per process. Not for a plan built inside this session, which build owns, or a plan not yet written, which spec owns.
argument-hint: "<plan path>"
disable-model-invocation: true
---

# Run a plan headless

Start the cheap loop on one plan: each unlanded task runs in a fresh `claude -p` process, then one verify process, no context carried between tasks. The enemy is a session that builds tasks itself while the script runs, so two writers race on one branch. The overcorrection is a session that adds flags or retries the script never asked for.

## Run

1. Argument → one plan path; none → ask for it, run nothing.
2. Run `node "${CLAUDE_SKILL_DIR}/../build/scripts/run-plan.mjs" <plan>` with Bash `run_in_background`; the run outlasts one foreground call.
3. Pass only flags the user typed; the script holds the defaults.
4. Exit → report its last `run-plan: stop:` line and the summary path it prints. Exit 0 = done, gate passing; 1 = any other stop; 2 = refusal.

## Judgment

- While it runs → touch no task, branch or file the script owns.
- Exit 1 or 2 → report the stop line; rerun only when the user asks.
