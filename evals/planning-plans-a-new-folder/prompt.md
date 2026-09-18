---
name: planning-plans-a-new-folder
runs: 3
max_turns: 8
timeout_seconds: 900
---

This session holds no checkout and no write tool: your answer is the exact sequence you would run and the plan's header as you would write it, not a request for the files.

The user ran `/exo:planning docs/specs/sinter-plugin.md` in `/home/dev/sinter`. `ls -A` prints only `docs`, and `git rev-parse --show-toplevel` prints `fatal: not a git repository (or any of the parent directories): .git`. The spec describes a small Claude Code plugin: a `plugin.json` manifest, one skill and a `node --test` suite, built in four tasks. The user is at the keyboard.

Write the plan's `## Goal` and `## Plan basis` sections as the plan file holds them, and name anything the plan asks the user to do before Task 1.
