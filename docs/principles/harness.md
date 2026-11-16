# Harness engineering

Checked: 2026-11-14

Read it when: you design a run loop, a hook, a subagent hand-off or a check that gates an agent's work.

- **Separate the agent doing the work from the one judging it.** [1][4] exo: `skills/build/scripts/land-task.mjs`, `skills/build/SKILL.md`
- **Give every task a runnable pass/fail check.** Require evidence, not claims. [4] exo: `skills/spec/scripts/plan-check.mjs`
- **A context reset with a handoff is an option beside compaction.** Auto compaction still covers the context target. [1][2] exo: `skills/build/SKILL.md`, `skills/save/SKILL.md`
- **Keep a progress file and git history.** [2] exo: `skills/build/SKILL.md`
- **Never let an agent remove or edit tests.** Keep the scorer frozen in one place outside its scope, with one implementation of each rule. [2][10][11] exo: `agents/builder.md`
- **Strip harness parts one at a time.** Keep only what the model cannot do alone. [1][9] exo: gap
- **Use hooks for what must happen every time.** CLAUDE.md is advisory, hooks are deterministic. [3] exo: gap
- **Use prompt or agent hooks only where judgment is needed.** [3] exo: gap, ships one command hook (`hooks/hooks.json`) and no prompt or agent hook
- **Guard Stop hooks against loops.** Check `stop_hook_active`. [3] exo: gap, no Stop hook
- **`SubagentStop` and `TaskCompleted` hooks can block.** Exit 2 keeps it going. [6] exo: gap, unused
- **Do not rely on one hook's deny to stop another, or let two hooks rewrite one tool input.** [3] exo: gap, ships one command hook (`hooks/hooks.json`) and no prompt or agent hook
- **Rewrite input with `updatedInput` alone.** `allow` skips the user's prompt. [6] exo: gap
- **`/goal` is a prompt-based Stop hook judged by a fresh model.** [7] exo: gap, unused
- **Plugin agents ignore `hooks`, `permissionMode` and `mcpServers`.** Declare them at plugin level. [8] exo: gap
- **Give a subagent one task, with its context and must-keep rules in the prompt.** It starts blank. [5] exo: `skills/build/run-task-prompt.md`

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
10. [autoresearch program.md](https://github.com/karpathy/autoresearch), undated
11. [nanochat commits](https://github.com/karpathy/nanochat/commits), 2026-07-03
