# harnesses: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## fast-task-gate
- The Codex tree rewrites ``with `run_in_background: true` `` (Task 7; seam: `tests/codex-rules.test.mjs`).

## brief
- `node --test tests/harness-capabilities.test.mjs` passes and fails when a matrix row and an adapter disagree (Task 1).
- No generated Codex agent holds `sandbox_mode` (Task 2).
- The OpenCode tree holds one agent file per exo agent with no `model:` line by default (Task 3).
- `node install.mjs --harness opencode` installs, updates and removes in a temp home (Task 4).
- `npm run check` passes (Success criterion).
