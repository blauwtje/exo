# Context

- **Language.** Replies, reports and questions are in the language of the user's latest message, whatever the skill's; a session opened only by a plan command writes in the plan's language. Code, commits, issues and written files keep the repository's.
- **Command output.** Log output that may pass forty lines under `.exo/` or a temp directory outside git; read back only failing lines.
- **Files.** Create files with Write, not compound Bash; one simple command per Bash call.
- **Progress.** No message between the steps of a run but a block, a failed check or a question only the user can answer.
- **Scope.** Write only the artifacts a skill names, at the length needed.
- **Reader budget.** A read-only dispatch to an agent type without its own limit, such as `general-purpose`, carries a standalone `Budget: 70k/100k` line, because the 40k default stops a reader after a few files.
- **Budget return.** A delegate's `BUDGET:` return is continued by a fresh agent for its open part, never finished by the main session itself, because that work would fill the context the rest of the run needs.
