# Bug fixer prompt

`build` hands the `exo:build-task` agent with `exo-kind: hardest` the absolute path of `../find-cause/fixer-prompt.md`, the section names `## build opening` and `## Shared block`, and fill values for the failed task with at most ten lines of its output, and reads back only the handoff path.
The shared block carries the lines of `../../lib/references/lean.md` a delegate needs.
