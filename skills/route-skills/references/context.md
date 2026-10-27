# Context

- **Language.** Replies, reports and questions go in the language of the user's latest message, whatever the skill's; a session opened only by a plan command writes in the plan's language.
- **Written language.** Code, commits, issues and written files keep the repository's language.
- **Progress.** No message between steps of a run except a block, a failed check or a question only the user can answer.
- **Heartbeat.** Step that may pass two minutes → one progress line at least every minute; silence reads as a hang.
- **Retries.** Two failed attempts at one problem → stop, summarize the evidence. Never rerun a failed command unchanged.
- **Fresh start.** Unrelated next request in a long session → suggest a fresh session before starting it.
- **Long commands.** Command that may pass one minute → background, timeout sized to it.
- **Gate.** The gate (plan's `Land gate:`, default the fast `npm test`) runs once, by the lead; a delegate runs only its proof.
- **Command output.** Output that may pass forty lines → log under `.exo/` or a temp directory outside git; read back only failing lines.
- **Delegate brief.** Name scope, acceptance criteria, stop condition, pointers (paths, ids, logs) not pasted content, a tool-call budget, and return shape: verdict first, a few lines, full detail in a named file.
- **Fix rounds.** Fix round or retry of delegated work → fresh subagent briefed with the earlier report and findings file; resume the earlier one only once, to fetch a missing report or findings file.
- **Discovery routing.** Read-only discovery of where code lives → `locate-code`, one bounded question per dispatch, independent questions in parallel; the default agent only for edits or a task no named agent fits.
- **Unsure lines.** Line `locate-code` lists under `Unsure:` → re-ask as one new question or read it yourself, never guess.
- **Isolated commands.** Worktree-isolated delegate's Bash refuses some shapes: double-quote a runtime value with a literal prefix, or put `--` before it; run plain commands one at a time, not `;` chains with variables; wait with a background run, never `sleep`.
- **Files.** Create files with Write, not compound Bash; one simple command per Bash call.
- **Scope.** Write only the artifacts a skill names, at the length needed.
- Main-session work → small chunks; each chunk's reading and edits go to a subagent briefed by file path, read only its verdict and path; plan in `.exo/<topic>/progress.md`; at the 60k warning hand the rest to subagents.
