# Context

- **Language.** Replies, reports and questions are in the language of the user's latest message, whatever the skill's; a session opened only by a plan command writes in the plan's language. Code, commits, issues and written files keep the repository's.
- **Command output.** Log output that may pass forty lines under `.exo/` or a temp directory outside git; read back only failing lines.
- **Long commands.** A command that may pass one minute runs in the background with a timeout sized to it; the gate (the plan's `Land gate:`, by default the fast `npm test`) runs once, by the lead, and a delegate runs only its proof.
- **Files.** Create files with Write, not compound Bash; one simple command per Bash call.
- **Isolated commands.** A worktree-isolated delegate's Bash refuses some shapes: double-quote a runtime value that has a literal prefix, or put `--` before it; run plain commands one at a time, not `;` chains with variables; wait with a background run, never `sleep`.
- **Progress.** No message between the steps of a run but a block, a failed check or a question only the user can answer; a step that may pass two minutes adds one progress line at least every minute, because silence reads as a hang.
- **Retries.** Stop after two failed attempts at one problem and summarize the evidence; a failed command is never rerun unchanged.
- **Delegate brief.** Name the scope, acceptance criteria, stop condition, pointers (paths, ids, logs) instead of pasted content, a tool-call budget and the return shape: verdict first, a few lines, full detail in a named file.
- **Terse return.** Under `replies=terse`, a dispatch asks for the return in terse form, because the model is its only reader; files the delegate writes keep normal prose.
- **Scope.** Write only the artifacts a skill names, at the length needed.
- **Reader budget.** A read-only dispatch to an agent type without its own limit, such as `general-purpose`, carries a standalone `Budget: 70k/100k` line, because the 40k default stops a reader after a few files.
- **Budget return.** A delegate's `BUDGET:` return is continued by a fresh agent for its open part, never finished by the main session itself, because that work would fill the context the rest of the run needs.
