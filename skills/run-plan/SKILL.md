---
name: run-plan
description: Use when the user invokes it to run a plan's unlanded tasks, which it hands to build, to install the terminal `exo run`, or to add its CI job. Not for a plan built inside this session, which build owns, or a plan not yet written, which spec owns.
argument-hint: "<plan path> | setup | ci"
disable-model-invocation: true
---

# Run a plan

Build the plan the user invokes run-plan on through `exo:build`, each task landed by agents in this session. The enemy is a session that starts the headless scripts itself, which refuse inside a session. The overcorrection is a session that builds tasks itself beside the build loop.

## Run

1. When the argument is `setup`, run `node "${CLAUDE_SKILL_DIR}/../build/scripts/exo-cli.mjs" setup`, report its output and stop.
   - When the argument is `ci`, run `node "${CLAUDE_SKILL_DIR}/scripts/ci-render.mjs"` in the user's repository, report its output and stop. It refuses to replace an edited workflow; pass `--force` only when the user asks.
   - Otherwise the argument is one plan path; with none, ask for it and run nothing.
2. With a plan path, invoke `exo:build <plan>` with the flags the user typed that build takes.
3. Report one line: the headless loop, each task in its own process, runs only from a terminal, as the user's `exo run <plan> --detach`.
4. When the build reports every task landed, offer once to save the plan as a template per `../spec/references/templates.md` `## Saving`, and save nothing before a yes.

## Judgment

- When a run is already live, touch no task, branch or file it owns.
- When an in-session loop is wanted, the official `/ralph-loop` plugin runs beside exo, because exo registers no Stop hook.
