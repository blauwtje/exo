# Run session prompts

`run-plan.mjs` fills one section per headless session and pastes nothing else. A `[[name]]` is a field it fills.

## Build session

Land [[task]] of [[plan]] in this session. Load no skill; the brief and the rules below are all you need.

Brief:
[[brief]]

Rules:
- Work in [[root]], with that path literally.
- Run one command per Bash call, exactly as the plan writes it; add no `$( )`, `;`, `&&`, `|`, redirect or heredoc.
- Create and change files only with the Write and Edit tools, not a heredoc or a redirect; read with Read.
- Run at most one test inside this session.
- Run builds and tests with output streaming; fix from the first error line.
- A test or command your sandbox or permission rules refuse is not a block: never end `[[task]]: BLOCKED` on one; report it as `not run`, not `failed`.
- Write the report as your reply text, above the last line, and end; write no report file. The script proves and lands.
- Change only the files the task lists. A registry, index or test list that must name a new file and is not listed → end on `[[task]]: BLOCKED <file> is missing from the file list`.
- Test-first when the task is risky or a fix: see the failing test first, then make it pass. Never delete, skip or loosen a test.
- Commit nothing by hand, push nothing, dispatch no agent, start no worktree. The script runs the task's Proof and Land gate outside this sandbox, commits, and lands.
- Ask nothing: a choice you cannot rule → `BLOCKED NEEDS ANSWER: <one short question>`; a reversible one → take the recommended option and write a `Decision: <clause>` report line.
- A `PLAN DRIFT:` line in this prompt → end on `[[task]]: PLAN DRIFT <item>`.
- The report, at most 25 lines, is the reply text above the last line: what landed, the proof output, `Unresolved:`.
- After your last edit and before the report, run [[codeRules]] and fix every finding it prints until it prints `Code rules OK`.
[[extra]]

End: when the work is done and the report is in the reply, end the reply; the script proves and lands.

Last line of the reply, nothing after it, one of:
- `[[task]]: GREEN`
- `[[task]]: BLOCKED <reason>`, one clause
- `[[task]]: PLAN DRIFT <reason>`, one clause
- `[[task]]: HANDOFF`, only when a context-limit notice tells you to write a hand-off file
[[retry]]

## Plan session

Build [[tasks]] of [[plan]] in this session. Load no skill.
Report to: [[report]]

Brief:
[[brief]]

After your last edit to a task and before its report, run its command and fix every finding it prints until it prints `Code rules OK`:
[[codeRules]]

[[stall]]

Last line of the reply, nothing after it, always on Task [[first]]: `Task [[first]]: GREEN`, `Task [[first]]: BLOCKED <reason>` or `Task [[first]]: PLAN DRIFT <reason>`. Another task that does not go green → name its number in the reason.
