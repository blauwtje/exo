# Agent engineering

Checked: 2026-11-16

Read it when: you design or change an agent loop, a workflow of several agents, a subagent split or a long-running task.

- **Start with the simplest solution and add agents only when they demonstrably improve outcomes.** [1] exo: `.claude/CLAUDE.md` adds an agent or stage only after a recorded failure
- **Use a workflow for predefined code paths, an agent only for open-ended tasks that need flexible control.** [1] exo: `skills/build/SKILL.md`
- **Give each subagent an objective, an output format, tool guidance and explicit boundaries.** [2] exo: `agents/builder.md`
- **Have subagents write results to external storage and return lightweight references.** [2] exo: `skills/build/references/run-task-prompt.md`
- **Use multi-agent setups only for high-value, breadth-first work.** The post cites about 15x the tokens of a chat. [2] exo: gap, skips subagents for small plans, but no cost test for breadth-first work
- **Lower effort to cut thinking, not prompt text.** Opus 5.5 defaults to medium and cannot disable thinking. [5] exo: `agents/builder.md`, `agents/researcher.md` set `effort:` in frontmatter
- **Name the kinds of early stop to avoid in unattended runs.** [5] exo: `agents/builder.md`
- **Give delegation criteria or a cap.** Opus 5.5 delegates readily; Fable 5.2 only when the prompt invites it. [5] exo: `skills/build/SKILL.md` sends a change over 2 files to `exo:build`
- **Load detail on demand: a short always-loaded part, references one level deep.** The spec sets about 100 tokens of metadata and a body under 5000 tokens. [6] exo: `skills/author/references/instruction-style.md`
- **Proceed on reversible work and present the result; pause only for an irreversible write.** [8] exo: `agents/builder.md` asks the user nothing
- **Give new work to a fresh subagent with the original brief, every later directive and the prior report; resume one only for state that is costly to move.** [7] exo: `skills/build/SKILL.md`
- **Match each subagent's model and effort to the job: one step up for the hardest work, down for routine work, same model family.** [7] exo: `skills/build/SKILL.md` Models table
- **Read the diff and write your own summary; do not pass a subagent's report through.** [7] exo: `skills/build/SKILL.md` builds the report from `git diff --stat` and commits, not builder summaries
- **Remove a shared write target before you serialize it: give each parallel worker its own file, branch or directory and merge at the read.** [9] exo: gap, `lib/land-lock.mjs` serializes landing instead
- **Build the script that does or proves the work and rerun it; fan out no subagent for what one script does in one pass.** [10] exo: `skills/build/scripts/land-task.mjs`
- **Write a throughput checkpoint before fan-out: first blocking steps, independent workstreams, shared mutable state, smallest decomposition; keep an item that does not apply with `n/a` and why.** [12] exo: `skills/spec/SKILL.md`
- **Start at most the concurrent subagent limit at once and check every launch result for an error, because a refused launch returns an error object, not an exception.** [13] exo: `skills/watch/SKILL.md`
- **Run an improvement loop as one change, one measurement, keep or revert, and stop on a target paired with a floor on attempts.** [11] exo: gap

## Sources

1. Building effective agents, 2024-12-19
2. Multi-agent research system, 2025-06-13
3. Effective harnesses for long-running agents, 2025-11-26
4. Harness design for long-running application development, 2026-03-24
5. Prompting Claude Opus 5.5, undated
6. Agent Skills specification, undated
7. mode skill, undated
8. principle-never-block-on-the-human, undated
9. principle-separate-before-serializing-shared-state, undated
10. principle-build-the-lever, undated
11. hillclimb playbook, undated
12. feature playbook, undated
13. How the Claude Code team uses Claude Code, undated
