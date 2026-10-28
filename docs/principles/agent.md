# Agent engineering

Checked: 2026-10-28

Read it when: you design or change an agent loop, a workflow of several agents, a subagent split or a long-running task.

- **Start with the simplest solution and add agents only when they demonstrably improve outcomes.** [1] exo: `.claude/CLAUDE.md` adds an agent or stage only after a recorded failure, `lib/plan-tasks.mjs` `planRoute` routes a small plan inline
- **Use a workflow for predefined code paths, an agent only for open-ended tasks that need flexible control.** [1] exo: `skills/build/references/run-loop.md`
- **Give each subagent an objective, an output format, tool guidance and explicit boundaries.** [2] exo: `agents/build-task.md`
- **Have subagents write results to external storage and return lightweight references.** [2] exo: `agents/run-unit.md`, `skills/build/implementer-prompt.md`
- **Use multi-agent setups only for high-value, breadth-first work.** The post cites about 15x the tokens of a chat. [2] exo: gap, `lib/plan-tasks.mjs` `planRoute` skips subagents for small plans, but no cost test for breadth-first work
- **Keep a progress file and git history.** A fresh session then orients quickly. [3] exo: `skills/build/references/run-loop.md`, `skills/build/scripts/run-state.mjs`
- **Separate the agent doing the work from the one judging it.** Tune the evaluator to be skeptical. [4] exo: `skills/build/references/fresh-eyes.md`, `agents/review-branch.md`
- **Lower effort to cut thinking, not prompt text.** Opus 5.5 defaults to medium and cannot disable thinking. [5] exo: `lib/model-kinds.json`, `hooks/agent-effort.mjs`
- **Name the kinds of early stop to avoid in unattended runs.** [5] exo: gap, `agents/build-task.md` `## Stop` lists when to stop, but no agent or build prompt names the early stops to avoid
- **Give delegation criteria or a cap.** Opus 5.5 delegates readily. [5] exo: gap, `agents/run-unit.md` names no delegation criteria and sets no cap
- **Load detail on demand: a short always-loaded part, references one level deep.** The spec sets about 100 tokens of metadata and a body under 5000 tokens. [6] exo: `skills/edit-skills/references/instruction-style.md`

## Sources

1. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), 2024-12-19
2. [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), 2025-06-13
3. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), 2025-11-26
4. [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), 2026-03-24
5. [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5), undated
6. [Agent Skills specification](https://agentskills.io/specification), undated
