# Harness engineering

Checked: 2026-10-22

Read it when: you design a run loop, a hook, a subagent hand-off or a check that gates an agent's work.

- **Separate the agent doing the work from the one judging it.** Tune the judge to be skeptical. [1][4] exo: `skills/build/scripts/land-task.mjs`, `skills/build/reviewer-prompt.md`
- **Give every task a runnable pass/fail check.** Require evidence, not claims. [4] exo: `skills/build/references/test-design.md`
- **Prefer a context reset with a structured handoff over compaction.** The 2026-03-24 post supersedes the 2025-11-26 guidance. [1][2] exo: `skills/build/references/run-loop.md`, `skills/build/implementer-prompt.md`
- **Keep a progress file and git history.** A fresh session then orients quickly. [2] exo: `skills/build/references/run-loop.md`
- **Never let an agent remove or edit tests.** Let it change only status fields. [2] exo: `agents/build-task.md`, `skills/gate/scripts/gate.mjs`
- **Strip harness parts one at a time.** Keep only what the model cannot do alone. Assumptions "can go stale as models improve". [1][9] exo: gap
- **Use hooks for what must happen every time.** CLAUDE.md is advisory, hooks are deterministic. [3] exo: `hooks/hooks.json`
- **Use prompt or agent hooks only where judgment is needed.** Use an agent hook to check codebase state. [3] exo: gap, only command hooks
- **Guard Stop hooks against loops.** Check `stop_hook_active`. [3] exo: `hooks/run-no-wait.mjs` caps blocks at `BLOCK_LIMIT = 2` per session, stricter than it
- **`SubagentStop` and `TaskCompleted` hooks can block.** Exit code 2 keeps the subagent or task from finishing. [6] exo: `hooks/hooks.json`
- **Do not rely on one hook's deny to stop another, or let two hooks rewrite one tool input.** Hooks run independently. [3] exo: `hooks/dispatch-bash.mjs` merges deny in-process
- **`/goal` is a prompt-based Stop hook judged by a fresh model.** It cannot run commands. [7] exo: gap, unused
- **Plugin agents ignore `hooks`, `permissionMode` and `mcpServers`.** Declare them at plugin level. [8] exo: `hooks/hooks.json`
- **Give a subagent one task, and state its context and must-keep rules in the prompt.** It starts blank. [5] exo: `skills/build/run-task-prompt.md`, `skills/build/implementer-prompt.md`

## Sources

1. [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), 2026-03-24
2. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), 2025-11-26
3. [Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide), undated
4. [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices), undated
5. [Create custom subagents](https://code.claude.com/docs/en/sub-agents), undated
6. [Hooks reference](https://code.claude.com/docs/en/hooks), undated
7. [Keep Claude working toward a goal](https://code.claude.com/docs/en/goal), undated
8. [Add components to a plugin](https://code.claude.com/docs/en/plugins/components), undated
9. [Scaling Managed Agents with stable interfaces](https://www.anthropic.com/engineering/managed-agents), 2026-04-08
