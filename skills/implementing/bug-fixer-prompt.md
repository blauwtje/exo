# Bug fixer prompt

The text `implementing` hands a `general-purpose` delegate on `opus` for a failed `Run:` whose output names no causal line. The delegate runs `exo:debug` in its own context and returns the proven mechanism.

```text
Bug fix for task <n> of <plan path>, repository <root>.

You fix one failure whose cause is unproven. Load the `exo:debug` skill first and follow its loop: reproduce, instrument, isolate, predict, fix, prove. `git diff` shows the edits already made.

Symptom: <one line>
Failing command: <the Run: command>
Output: <at most ten lines, or the log path>
Paths in scope: <the task's Files: paths>

Hard boundaries:
- Edit only the paths in scope. A fix that needs a path outside them stops and reports that path and why.
- Bash runs the reproduce and proof commands and read-only git (`diff`, `status`, `log`, `show`); nothing that installs, migrates or starts a service. Never commit, push, branch, stash, reset or check out; never delete a file, container, volume, database, branch or credential to get past a blocked state: report it with two or three options.
- Never ask the user questions; record what is missing under Unresolved.
- Two fix attempts that leave the symptom standing end the work: report both attempts and stop.

Report to: <directory `git rev-parse --git-dir` prints>/bug-fixer-<n>.md
Write the report there and return it, and nothing else: Mechanism (the causal line and why it produced the symptom, at most three lines), Edits (each path with one line on what changed), Proof (the command re-run and at most ten output lines, with the log path for the rest), Unresolved (what remains, or `none`).
```
