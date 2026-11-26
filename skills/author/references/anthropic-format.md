# Anthropic format rules no check enforces

`npm run validate:static` covers the name, description, line-count, reference-link and hook-wrapper rules, the agent and output style frontmatter, the skill `metadata` values and the eval case format, so none is listed here. Sources: [spec](https://agentskills.io/specification), [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [Claude Code skills](https://code.claude.com/docs/en/skills).

## Skill

- Write the description in the third person, with what the skill does and when to use it: "Always write in third person" ([best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)).
- Avoid a vague description such as "Helps with documents" (same page).
- Give a reference file over 100 lines a table of contents at the top (same page).
- Use forward slashes in every file path, and name a file for its content, not `doc2` (same page).
- Leave out text that will age: "Avoid time-sensitive information" (same page). Put a fact that will age under an "Old patterns" heading.
- Choose one term per concept and use it throughout (same page).
- Justify every number: "justify and document configuration parameters to avoid voodoo constants" (same page).
- Explain why instead of heavy-handed capital MUSTs: "Try hard to explain the why" (the skill-creator skill).
- Match the degrees of freedom to the task, and give a default with an escape hatch instead of several approaches (best practices).
- Name each required package in the body, and say whether Claude runs a script or reads it as reference (best practices).
- Write an MCP tool as `ServerName:tool_name` (best practices).
- Keep the instructions under 5,000 tokens and put the most important ones near the top, because compaction keeps only the first 5,000 tokens of a skill ([Claude Code skills](https://code.claude.com/docs/en/skills)).
- Treat `argument-hint`, `model` and `effort` as Claude Code keys: the spec lists six fields, and "packaging or upload fails with a hard error" on another ([Claude Code skills](https://code.claude.com/docs/en/skills)).
- Write three evaluations before extensive documentation, and test with each model the skill will run on (best practices).

## Hook

Source: [hooks](https://code.claude.com/docs/en/hooks).

- A `SessionStart` matcher is `startup`, `resume`, `clear`, `compact` or `fork`.
- `timeout` is a number of seconds, and `SessionStart` supports only `command` and `mcp_tool` handlers.

## Eval case

Source: [plugin evals](https://code.claude.com/docs/en/plugin-evals).

- Set `max_turns` generously: hitting it counts as a run error and usually lowers the score.
- Assert that a tool was never called with both `min: 0` and `max: 0`.
- Grade a long output with a `regex` grader over the file, and keep `llm` graders for short output with concrete PASS and FAIL conditions.
- Give each case one grader on the result and one on the steps, such as `tool_used`.
- Seed files and git state only through `scaffold_script`, because project configuration it writes is not loaded.
- Start each run from an empty directory: put what the task needs in the prompt or the scaffold.
