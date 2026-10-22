# Context engineering

Checked: 2026-10-22

Read it when: you change what a skill, agent or run loads into a window, hands to a sub-agent or keeps between steps.

- **Treat context as a finite resource.** Returns diminish as the window fills. [1] exo: `skills/route-skills/references/context.md`
- **Aim for the smallest set of high-signal tokens.** Fewer tokens that carry the point give the desired outcome more often. [1] exo: `skills/edit-skills/references/instruction-style.md`
- **Load data just in time.** Keep lightweight identifiers such as file paths and read them when needed. [1] exo: `skills/route-skills/references/context.md`
- **Delegate focused work to sub-agents.** They start with a clean window and return a short result. [1] exo: `agents/locate-code.md`, `skills/route-skills/references/context.md`
- **Keep full history in a durable store outside the window.** Irreversible trimming loses what a later step may need. [3] exo: `skills/build/references/run-loop.md` keeps landed tasks in commits, `skills/route-skills/references/context.md` logs output under `.exo/`
- **Prefer a reset to compaction for a fresh start.** A reset hands over files instead of a summary; later guidance refines the earlier compaction advice. [1][2] exo: `skills/route-skills/references/context.md` suggests a fresh session, `skills/build/references/run-loop.md` resumes from commits

## Sources

1. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29
2. [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), 2026-03-24
3. [Managed agents](https://www.anthropic.com/engineering/managed-agents), 2026-04-08
