# Prompt engineering

Checked: 2026-10-22

Read it when: you write or change a prompt, skill, agent brief or delegation text.

- **Start minimal, then refine against observed failures.** A short prompt shows what the model gets wrong before you add rules. [1] exo: `skills/edit-skills/references/plugging-holes.md:5-10`
- **Say exactly what output you want.** The model does not infer a format or scope you left unstated. [2] exo: `agents/fetch-docs.md:41`, `skills/edit-skills/references/skill-shape.md:13`
- **Say what to do, not what to avoid, and give the reason.** A stated reason lets the model apply a constraint to cases you did not list. [2] exo: gap, `skills/edit-skills/references/instruction-style.md:41` makes phrasing positive, but `:18` cuts a reason unless it sets a boundary
- **Use a few diverse, canonical examples, not lists of edge-case rules.** Examples carry the pattern in fewer tokens. [1] exo: `skills/edit-skills/references/instruction-style.md:16`
- **Turn subjective judgments into concrete grading criteria.** Calibrate evaluators with examples so scores stay stable. [3] exo: `skills/edit-skills/references/blind-eval.md:15`
- **Write names and descriptions for the trigger decision.** A description that singles out one skill or subagent routes correctly. [4] exo: `skills/edit-skills/references/description.md:5-8`
- **State needed context in the delegation prompt.** A subagent starts blank and sees no conversation history. [5] exo: `skills/route-skills/references/context.md:12`, `skills/build/implementer-prompt.md:11-14`

## Sources

1. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29
2. [Best practices for prompt engineering](https://claude.com/resources/articles/best-practices-for-prompt-engineering), 2025-11-10
3. [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), 2026-03-24
4. [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), 2025-10-16
5. [Create custom subagents](https://code.claude.com/docs/en/sub-agents), undated
