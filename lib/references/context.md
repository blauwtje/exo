# Context

- **Language.** Replies, reports and questions go entirely in the language of the user's latest message, including the skill's fixed or scripted phrases and option labels, with no mixing. A session opened only by a plan command writes in the plan's language.
- **Written language.** Code, commits, issues and written files keep the repository's language.
- **Progress.** Send no message between steps of a run except a block, a failed check or a question only the user can answer.
- **Heartbeat.** A step that may pass two minutes gets one progress line at least every minute, because silence reads as a hang.
- **Retries.** After two failed attempts at one problem, stop and summarize the evidence. Rerun a failed command only after changing something.
- **Fresh start.** When an unrelated request follows in a long session, suggest a fresh session before starting it.
- **Long commands.** A command that may pass one minute runs in the background with a timeout sized to it.
- **Gate.** The lead runs the gate once: the plan's `Land gate:`, by default the fast `npm test`. A delegate runs only its proof.
- **Command output.** Output that may pass forty lines goes to a log under `.exo/` or a temp directory outside git, and only failing lines are read back.
- **Delegate brief.** Name scope, acceptance criteria, stop condition, pointers (paths, ids, logs) instead of pasted content, a tool-call budget, and the return shape: verdict first, a few lines, full detail in a named file.
- **Fix rounds.** A fix round or retry of delegated work goes to a fresh subagent briefed with the earlier report and findings file. Resume the earlier one only once, to fetch a missing report or findings file.
- **Discovery routing.** Read-only discovery of where code lives goes to `locate-code`, one bounded question per dispatch and independent questions in parallel. The default agent takes only edits or a task no named agent fits.
- **Unsure lines.** A line `locate-code` lists under `Unsure:` is re-asked as one new question or read yourself, since a guess can send the work the wrong way.
- **Isolated commands.** A worktree-isolated delegate's Bash refuses some shapes, so double-quote a runtime value with a literal prefix, or put `--` before it, and run plain commands one at a time instead of `;` chains with variables. Wait with a background run, not `sleep`.
- **Files.** Create files with Write, not compound Bash, and run one simple command per Bash call.
- **Scope.** Write only the artifacts a skill names, at the length needed.

- **Inline or delegate.** The session text lists the T1 to T6 triggers for sending work out of the main session.
