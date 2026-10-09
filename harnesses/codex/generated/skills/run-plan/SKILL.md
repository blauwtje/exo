---
name: run-plan
description: "Use when the user invokes it to run a plan's unlanded tasks in headless sessions, one task per process. Not for a plan run with subagents, which build owns, or a plan not yet written, which spec owns."
---

# Run a plan headless

Start the cheap loop on one plan: each unlanded task runs in a fresh `claude -p` process, then one verify process, with no subagent and no context carried between tasks.

## Run

1. The argument is one plan path; none → ask for it, run nothing.
2. Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/run-plan.mjs" <plan>` in the background with Bash `run_in_background`; the run outlasts one foreground call.
3. Pass no flag the user did not type; the script holds the defaults.
4. When it exits, report its last `run-plan: stop:` line and the summary path it prints. Exit 0 is done with the gate passing; 1 is any other stop; 2 is a refusal.
5. Touch no task, branch or file the script owns while it runs.
