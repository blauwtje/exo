---
name: run-plan
description: Use when the user invokes it to run a plan's unlanded tasks, which it hands to build, or to install the terminal `exo run`. Not for a plan built inside this session, which build owns, or a plan not yet written, which spec owns.
argument-hint: "<plan path> | setup"
disable-model-invocation: true
---

# Run a plan

Build the plan the user invokes run-plan on through `exo:build`, each task landed by agents in this session. The enemy is a session that starts the headless scripts itself, which refuse inside a session. The overcorrection is a session that builds tasks itself beside the build loop.

## Run

1. Argument `setup` → run `node "${CLAUDE_SKILL_DIR}/../build/scripts/exo-cli.mjs" setup`, report its output, stop.
   - Else argument → one plan path; none → ask for it, run nothing.
2. Plan path → invoke `exo:build <plan>` with the flags the user typed that build takes.
3. Report one line: the headless loop, each task in its own process, runs only from a terminal, as the user's `exo run <plan> --detach`.

## Judgment

- Run already live → touch no task, branch or file it owns.
- In-session loop wanted → official `/ralph-loop` plugin runs beside exo; exo registers no Stop hook.
