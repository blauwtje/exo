# Harness engineering

Checked: 2026-11-16

Read it when: you design a run loop, a hook, a subagent hand-off or a check that gates an agent's work.

- **Separate the agent doing the work from the one judging it.** [1][4] exo: `skills/build/scripts/land-task.mjs`, `skills/build/SKILL.md`
- **Give every task a runnable pass/fail check.** Require evidence, not claims. [4] exo: `skills/spec/scripts/plan-check.mjs`
- **A context reset with a handoff is an option beside compaction.** Auto compaction still covers the context target. [1][2] exo: `skills/build/SKILL.md`, `skills/save/SKILL.md`
- **Keep a progress file and git history.** [2] exo: `skills/build/SKILL.md`
- **Never let an agent remove or edit tests.** Keep the scorer frozen in one place outside its scope, with one implementation of each rule. [2][10][11] exo: `agents/builder.md`, decided: an agent may rewrite a test that passes without the behaviour it claims to guard; it never loosens or deletes a test that guards behaviour
- **Strip harness parts one at a time.** Keep only what the model cannot do alone. [1][9] exo: gap
- **Use hooks for what must happen every time.** CLAUDE.md is advisory, hooks are deterministic. [3] exo: gap
- **Use prompt or agent hooks only where judgment is needed.** [3] exo: gap, ships two command hooks (`hooks/hooks.json`) and no prompt or agent hook
- **Guard Stop hooks against loops.** Check `stop_hook_active`. [3] exo: gap, no Stop hook
- **`SubagentStop` and `TaskCompleted` hooks can block.** Exit 2 keeps it going. [6] exo: gap, unused
- **Do not rely on one hook's deny to stop another, or let two hooks rewrite one tool input.** [3] exo: gap, ships two command hooks (`hooks/hooks.json`) and no prompt or agent hook
- **Rewrite input with `updatedInput` alone.** `allow` skips the user's prompt. [6] exo: gap
- **`/goal` is a prompt-based Stop hook judged by a fresh model.** [7] exo: gap, unused
- **Plugin agents ignore `hooks`, `permissionMode` and `mcpServers`.** Declare them at plugin level. [8] exo: gap
- **Give a subagent one task, with its context and must-keep rules in the prompt.** It starts blank. [5] exo: `skills/build/run-task-prompt.md`, decided: pass file pointers, see context.md
- **Guard with a script, check or lint and ship no hook; the pinned sources declare only skills and agents.** Encode a rule that recurs as structure, not as more text. [12][13] exo: conflict with [3], decided: keep only the two hooks in `hooks/hooks.json`, add none
- **Accept a verdict only from a verifier that did not write the code; green CI and a bot approval are not verdicts.** [14] exo: `skills/build/SKILL.md` ends with the built-in `code-review`, decided: only a verdict from an agent that did not write the code counts, at any size; for a fix under the review threshold, the lead rerunning the repro command itself is that verdict
- **Compare `git patch-id` at the verdict's commit with the current head before you trust an older verdict.** A rebase moves a commit without failing a check. [14] exo: gap
- **Land only the contiguous verified run from the bottom, and touch no branch of the stack while it lands.** [14] exo: `skills/ship/SKILL.md`
- **Check the real artifact, not a proxy such as a self-report, a timestamp or "it compiles"; when a check fails, doubt how you observed before the system.** [15] exo: `agents/builder.md` counts done only with proof on the real product
- **Script the check and keep its output where a reviewer can rerun it.** [15] exo: `skills/build/scripts/land-task.mjs`
- **Verify each unit before the next: known-good state, one change, the check, then proceed.** [16] exo: `skills/build/scripts/land-task.mjs` proves red then green per task

## Sources

1. Harness design for long-running application development, 2026-03-24
2. Effective harnesses for long-running agents, 2025-11-26
3. Automate actions with hooks, undated
4. Best practices for Claude Code, undated
5. Create custom subagents, undated
6. Hooks reference, undated
7. Keep Claude working toward a goal, undated
8. Add components to a plugin, undated
9. Scaling Managed Agents with stable interfaces, 2026-04-08
10. autoresearch program.md, undated
11. nanochat commits, 2026-07-03
12. principle-encode-lessons-in-structure, undated
13. plugin manifest, undated
14. shipping playbook, undated
15. principle-prove-it-works, undated
16. principle-sequence-verifiable-units, undated
