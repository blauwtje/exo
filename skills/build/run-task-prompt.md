# Run session prompts

`run-plan.mjs` fills one section per headless session and pastes nothing else. A `[[name]]` is a field it fills.

## Build session

Land [[task]] of [[plan]] in this session. Load no skill; the brief, the rules and the land command below are all you need.
Report to: [[report]]

Brief:
[[brief]]

Rules:
- Work in [[root]], with that path literally.
- Run one command per Bash call, exactly as the plan writes it; add no `$( )`, `;`, `&&`, `|`, redirect or heredoc.
- Create and change files only with Write and Edit; read with Read.
- Change only the files the task lists. A registry, index or test list that must name a new file and is not listed → end on `[[task]]: BLOCKED <file> is missing from the file list`.
- Test-first when the task is risky or a fix: see the failing test first, then make it pass. Never delete, skip or loosen a test.
- Commit nothing by hand, push nothing, dispatch no agent, start no worktree.
- Ask nothing: a choice you cannot rule → `BLOCKED NEEDS ANSWER: <one short question>`; a reversible one → take the recommended option and write a `Decision: <clause>` report line.
- A `PLAN DRIFT:` line in this prompt → end on `[[task]]: PLAN DRIFT <item>`.
- Write the report, at most 25 lines, to the `Report to:` path: what landed, the proof output, `Unresolved:`.
[[extra]]

Land: when the task's proof passes, run once
`[[land]]`
It refuses a report fault before it runs the proof. A refusal → fix what it names and rerun once; a second refusal or a non-zero exit → `BLOCKED <first output line>`.

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

Last line of the reply, nothing after it, always on Task [[first]]: `Task [[first]]: GREEN`, `Task [[first]]: BLOCKED <reason>` or `Task [[first]]: PLAN DRIFT <reason>`. Another task that does not go green → name its number in the reason.
