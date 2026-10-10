# Bug fixer prompt

`build` hands the `exo:solve-hard` agent the absolute path of `../find-cause/fixer-prompt.md`, the section names `## build opening` and `## Shared block`, and fill values for the failed task with at most ten lines of its output, and reads back only the handoff path.
The shared block carries the lines of `../../skills/route-skills/references/lean.md` a delegate needs.
