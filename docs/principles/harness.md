# Harness engineering

Checked: 2026-10-22

Read it when: you design a run loop, a hook, a subagent hand-off or a check that gates an agent's work.

- **Separate the agent doing the work from the one judging it.** Tune the judge to be skeptical. [1][4] exo: `skills/build/scripts/land-task.mjs:599` reruns the proof itself, `skills/build/reviewer-prompt.md:11` fresh-context review
- **Give every task a runnable pass/fail check.** Require evidence, not claimed success. [4] exo: `skills/build/references/test-design.md:19-20`, `skills/build/scripts/land-task.mjs:599`
- **Prefer a context reset with a structured handoff over compaction.** The 2026-03-24 post supersedes the 2025-11-26 guidance on context handling. [1][2] exo: `skills/build/references/run-loop.md:13` and `skills/build/implementer-prompt.md:12` run each task in a fresh agent from a brief file
- **Keep a progress file and git history.** A fresh session then orients quickly. [2] exo: `skills/build/references/run-loop.md:13` reads landed tasks from `Plan-task:` commits, `skills/build/scripts/run-state.mjs:58` writes `state.json`
- **Never let an agent remove or edit tests.** Let it change only status fields. [2] exo: `agents/build-task.md:24` forbids weakening a test, `skills/verify/scripts/verify.mjs:150` warns on one; tests may be added
- **Strip harness parts one at a time.** Keep only what the model cannot do alone. [1] exo: gap, `skills/edit-skills/SKILL.md:54` cuts skill lines only, no one-at-a-time removal of run stages
- **Use hooks for what must happen every time.** CLAUDE.md is advisory, hooks are deterministic. [3] exo: `hooks/hooks.json`
- **Use prompt or agent hooks only where judgment is needed.** Pick an agent hook to check real codebase state. [3] exo: gap, `hooks/hooks.json` holds only command hooks
- **Guard Stop hooks against loops.** Check `stop_hook_active` in the hook input. [3] exo: `hooks/run-no-wait.mjs:11,58-67` caps blocks per session at `BLOCK_LIMIT`, not via `stop_hook_active`
- **Do not rely on one hook's deny to stop another, or let two hooks rewrite one tool input.** Hooks run independently. [3] exo: `hooks/hooks.json:19,30,41` one hook per matcher, `hooks/dispatch-bash.mjs:27` merges deny in-process, `CONTRIBUTING.md:96`
- **Give a subagent one task, and state its context and must-keep rules in the prompt.** It starts blank. [5] exo: `skills/build/run-task-prompt.md:7,22` and `skills/build/implementer-prompt.md:11-14` give one task, brief and rules

## Sources

1. [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), 2026-03-24
2. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), 2025-11-26
3. [Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide), undated
4. [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices), undated
5. [Create custom subagents](https://code.claude.com/docs/en/sub-agents), undated
