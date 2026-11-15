# Context engineering

Checked: 2026-11-14

Read it when: you change what a skill, agent or run loads into a window, hands to a sub-agent or keeps between steps.

- **Treat context as a finite resource.** Returns diminish as the window fills. [1] exo: gap
- **Aim for the smallest set of high-signal tokens.** Fewer tokens that carry the point give the desired outcome more often. [1] exo: `skills/author/references/instruction-style.md`
- **Load data just in time.** Keep lightweight identifiers such as file paths and read them when needed. [1] exo: `skills/build/SKILL.md` hands the builder its prompt by path
- **Delegate focused work to sub-agents.** They start with a clean window and return a short result. [1] exo: `agents/researcher.md`
- **Keep full history in a durable store outside the window.** Irreversible trimming loses what a later step may need; a loop keeps its state in files, so the lead reads rows, not logs. [3][4] exo: `skills/build/SKILL.md` keeps landed tasks in commits
- **Hand over files rather than a summary when a fresh start is cheaper.** A reset hands over files instead of a summary; auto compaction still covers the context target, so a reset is a choice, not a rule. [1][2] exo: `skills/save/SKILL.md` saves a session for a fresh one, `skills/build/SKILL.md` resumes from commits

## Sources

1. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29
2. [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), 2026-03-24
3. [Managed agents](https://www.anthropic.com/engineering/managed-agents), 2026-04-08
4. [autoresearch program.md](https://github.com/karpathy/autoresearch), undated
