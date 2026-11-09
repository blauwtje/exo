# Prompt engineering

Checked: 2026-10-28

Read it when: you write or change a prompt, skill, agent brief or delegation text.

- **Start minimal, then refine against observed failures.** A short prompt shows what the model gets wrong before you add rules. [1] exo: `skills/edit-skills/references/plugging-holes.md`
- **Say exactly what output you want.** The model infers no unstated format. [2] exo: `agents/research-worker.md`
- **Say what to do, not what to avoid, and give the reason.** A reason covers unlisted cases. [2] exo: gap, `skills/edit-skills/references/instruction-style.md` cuts reasons
- **Use a few canonical examples, not lists of edge-case rules.** [1] exo: `skills/edit-skills/references/instruction-style.md`
- **Turn subjective judgments into concrete grading criteria.** [3] exo: `skills/edit-skills/references/blind-eval.md`
- **Write names and descriptions for the trigger decision.** A distinct description routes correctly. [4][7] exo: `skills/edit-skills/references/description.md`
- **State needed context in the delegation prompt.** A subagent starts blank. [5] exo: `lib/references/context.md`, `skills/build/implementer-prompt.md`
- **Ask for every finding, then filter in a second pass.** Opus 5.5 reads "only high-severity" literally. [6] exo: gap, no review prompt filters in a second pass
- **Explain why instead of CAPS, MUST or "if in doubt, use X".** Opus 5.5 overtriggers. [6][8] exo: gap, `skills/edit-skills/references/instruction-style.md` holds no "if in doubt" rule
- **Drop "double-check" and "final verification" steps.** Opus 5.5 over-verifies. [6] exo: gap, no check flags these phrases
- **Think before coding: settle open decisions.** [9] exo: `skills/spec/SKILL.md`
- **Simplicity first: the least code that works.** [9] exo: `lib/references/lean.md`
- **Surgical changes: touch only what is asked.** [9] exo: `lib/references/lean.md`
- **Goal-driven execution: work toward a check.** [9] exo: `harnesses/codex/agent-preamble.md`

## Sources

1. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29
2. [Best practices for prompt engineering](https://claude.com/resources/articles/best-practices-for-prompt-engineering), 2025-11-10
3. [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), 2026-03-24
4. [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), 2025-10-16
5. [Create custom subagents](https://code.claude.com/docs/en/sub-agents), undated
6. [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5), undated
7. [Agent Skills specification](https://agentskills.io/specification), undated
8. [Agent Skills best practices](https://github.com/agentskills/agentskills/blob/main/docs/skill-creation/best-practices.mdx), undated
9. [Karpathy coding guidelines](https://github.com/forrestchang/andrej-karpathy-skills), undated
