# The direct route: the fallback when nested dispatch is unavailable

- Step 3 runs `next-task.mjs` without `--block`, for its `Next:` or `Wave:` line.
- `GREEN` names a diff path this session reads as `git apply --stat <diff path>` only, never the report and never the full diff; it runs `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`, ending in the `Next:` or `Wave:` line, a wave's per the wave worktrees reference's step 3.
- A `Next:` line sends its task, a `Wave:` line each task per the wave worktrees reference in one message, to `exo-build-task` from `../implementer-prompt.md`, which carries `Return: one line`.
- In a wave, a failed sibling never discards a green task.
- That reference's step 4 saves each worktree's diff, then removes it.
- Land-task refusal about the report (no report, no Proof command, a command listed as failing) → SendMessage to the agent that wrote it, with land-task's full refusal verbatim; this session reruns no proof to repair a report.
- Build-task stopped at its turn limit before green → redispatch `exo-build-task` from `../implementer-prompt.md`, not an improvised prompt to another agent.
- Any other land-task refusal reads the full diff; any other line hands its report path, unread, to a repair delegate: `PLAN DRIFT` to `../drift-repairer-prompt.md`, `BLOCKED` or a failed `Run:` with no cause to `../bug-fixer-prompt.md`.
- Second failure of one task → stop the run `BLOCKED` with both reports and 2-3 options.
- Land-task refusal other than `PLAN DRIFT` or a report refusal → repair delegate the same way, rerun once; a second refusal stops likewise.
