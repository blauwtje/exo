# Prompt engineering

Checked: 2026-10-28

Read it when: you write or change a prompt, skill, agent brief or delegation text.

- **Start minimal, then refine against observed failures.** A short prompt shows what the model gets wrong before you add rules. [1] exo: `skills/edit-skills/references/plugging-holes.md`
- **Say exactly what output you want.** The model does not infer a format or scope you left unstated. [2] exo: `agents/fetch-docs.md`, `skills/edit-skills/references/skill-shape.md`
- **Say what to do, not what to avoid, and give the reason.** A stated reason lets the model apply a constraint to cases you did not list. [2] exo: gap, `skills/edit-skills/references/instruction-style.md` makes phrasing positive, but the same file cuts a reason unless it sets a boundary
- **Use a few diverse, canonical examples, not lists of edge-case rules.** Examples carry the pattern in fewer tokens. [1] exo: `skills/edit-skills/references/instruction-style.md`
- **Turn subjective judgments into concrete grading criteria.** Calibrate evaluators with examples so scores stay stable. [3] exo: `skills/edit-skills/references/blind-eval.md`
- **Write names and descriptions for the trigger decision.** A description that singles out one skill or subagent routes correctly. [4][7] exo: `skills/edit-skills/references/description.md`
- **State needed context in the delegation prompt.** A subagent starts blank and sees no conversation history. [5] exo: `skills/route-skills/references/context.md`, `skills/build/implementer-prompt.md`
- **Ask for every finding, then filter in a second pass.** Opus 5.5 follows "only report high-severity" literally. [6] exo: gap, no review prompt names the filter pass
- **Explain why instead of CAPS, MUST or "if in doubt, use X".** Opus 5.5 overtriggers on them. [6][8] exo: gap, `skills/edit-skills/references/instruction-style.md` bans CAPS and `MUST` but holds no "if in doubt" rule
- **Drop "double-check" and "final verification" steps.** Opus 5.5 over-verifies. [6] exo: gap, no check flags these phrases

## Sources

1. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29
2. [Best practices for prompt engineering](https://claude.com/resources/articles/best-practices-for-prompt-engineering), 2025-11-10
3. [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), 2026-03-24
4. [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), 2025-10-16
5. [Create custom subagents](https://code.claude.com/docs/en/sub-agents), undated
6. [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5), undated
7. [Agent Skills specification](https://agentskills.io/specification), undated
8. [Agent Skills best practices](https://github.com/agentskills/agentskills/blob/main/docs/skill-creation/best-practices.mdx), undated
