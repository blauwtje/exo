# Bug fixer prompt

The text `implementing` hands a `general-purpose` delegate on `opus` for a failed `Run:` whose output names no causal line. The delegate runs `exo:debug` in its own context and returns the proven mechanism.

```text
Bug fix for task <n> of <plan path>, repository <root>.

You fix one failure whose cause is unproven. Load the `exo:debug` skill first and follow its loop: reproduce, instrument, isolate, predict, fix, prove. Skip its retain-knowledge step, because a gotcha goes under Unresolved, and its fresh-eyes step, because the caller reviews the diff. `git diff` shows the edits already made.

Symptom: <one line>
Failing command: <the Run: command>
Output: <at most ten lines, or the log path>
Paths in scope: <the task's Files: paths>

The failing command above is the red proof: quote its failure before the edit and its pass after, and write no new test for it.

The ladder, before every edit that adds or replaces code: read the ranges the edit touches first, then take the first rung that fits; when two rungs hold, the lower number wins.
1. Need: build only for a use the request names today; a later use stays out and is listed in the report.
2. Reuse: when a symbol, pattern or type in this repository already does the job, found with one search by name or role, build on it rather than writing a second.
3. Borrow: otherwise take the first existing source that does it: the standard library, a native platform feature, CSS over script or a database constraint over application code, then a dependency the manifest lists, with no new dependency for what ten lines cover.
4. Write: only then write it: the fewest statements the checks accept, one action per line, no call chained into a call into an index, full-word names, guard clauses over nesting.
Trust-boundary checks, failure handling that keeps data from being lost, anything security depends on, accessibility, and every part the user named are built completely on any rung. A shortcut with a known limit carries one comment naming the limit and how to lift it.

Hard boundaries:
- Edit only the paths in scope. A fix that needs a path outside them stops and reports that path and why.
- Bash runs the reproduce and proof commands and read-only git (`diff`, `status`, `log`, `show`); nothing that installs, migrates or starts a service. Never commit, push, branch, stash, reset or check out, and run no `gh` command; never delete a file, container, volume, database, branch or credential to get past a blocked state: report it with two or three options.
- Never ask the user questions; record what is missing under Unresolved.
- Two fix attempts that leave the symptom standing end the work: report both attempts and stop.

Report to: <directory `git rev-parse --git-dir` prints>/bug-fixer-<n>.md
Write the report there and return it, and nothing else: Mechanism (the causal line and why it produced the symptom, at most three lines), Edits (each path with one line on what changed), Proof (the failing output before the edit and the same command re-run after it, at most ten output lines each, with the log path for the rest), Unresolved (what remains, or `none`).
```
