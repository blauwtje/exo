# Tool engineering

Checked: 2026-10-22

Read it when: you write or change a tool, an MCP server or a tool description an agent will call.

- **Build fewer, non-overlapping tools.** More tools do not always lead to better outcomes. [1] exo: gap
- **Namespace related tools.** A shared prefix tells the agent which tools belong together. [1] exo: gap
- **Return only high-signal data.** Add pagination and filtering so one call does not flood the context. [1] exo: gap
- **Write descriptions as for a new teammate.** State what the tool does and when to use it. [1] exo: `skills/edit-skills/references/description.md`
- **Name parameters unambiguously.** A clear name saves the agent a wrong call. [1] exo: gap
- **Present MCP servers as code APIs.** Load only the definitions needed and keep intermediate results out of context. [2] exo: gap
- **Defer rarely used tools behind tool search.** Large definition sets cost context on every turn. [3] exo: gap
- **Prefer extended thinking over a dedicated think tool.** The 2025-12-15 update to the think-tool post supersedes the tool in most cases. [4] exo: gap

## Sources

1. [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), 2025-09-11
2. [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp), 2025-11-04
3. [Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use), 2025-11-24
4. [The think tool](https://www.anthropic.com/engineering/claude-think-tool), updated 2025-12-15
