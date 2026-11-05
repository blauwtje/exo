# Files the user reads

This page sets how exo writes a file the user opens, so a reader with no background gets the answer at a glance. A file only agents read keeps whatever form suits the model.

## Rules

- Open with one line that gives the answer, before any heading.
- Use words a 5-year-old knows. Use a jargon word only when no plain word exists, and explain it once where it first appears.
- Keep each sentence short, one idea per bullet.
- Add short headings, bullets, a table where rows compare, and a small tree or arrow chain for flow.
- Write in the language of the user's latest message, fixed headings and phrases included.
- Put no machine text in it: no all-caps status words, `KEY: value` lines, raw script output, code names, flags or `file:line`, unless the user must type or open that exact thing.
- Name a file, command or number as the source gives it.
- Leave out the phrasing under Banned phrasing.

## Plain words

| Instead of | Say |
|---|---|
| artefact, artifact | file |
| repository, repo | project |
| invoke | run |
| persist | save |
| utilize, leverage | use |
| validate, verify | check |
| regression | something that worked and broke |
| dependency | library the code needs |
| deprecated | old, due to go |
| idempotent | safe to run twice |
| latency | wait time |
| parameter, flag | option |
| refactor | rewrite, same behavior |
| ambiguous | unclear |
| iterate | repeat |
| schema | shape of the data |
| payload | the data sent |
| hash, sha | short commit code |
| diff | list of changes |
| lint | style check |
| stale | out of date |
| boilerplate, scaffold | starter code |
| sandbox | safe test area |
| worktree | separate copy of the project |
| fixture, mock | sample data, fake stand-in |
| landed | added to the branch |

## Banned phrasing

- `delve`, `tapestry`, `landscape`, `pivotal`, `seamless`, `robust`, `comprehensive`, `streamline`, `facilitate`
- `it's worth noting`, `it is worth noting`, `in order to`, `let's dive`, `key takeaway`, `in conclusion`
- `I hope this helps`, `great question`, `certainly!`, `not just`, `ensure that`

## Sources

The check `user-read format` reads this table. A listed file needs an answer line before its first heading, the user's-language rule, no banned phrase and at most 2 plain-word entries per 100 words.

| File | Section |
|---|---|
| `skills/gate/assets/run-report.md` | - |
| `skills/save-session/assets/handoff-template.md` | - |
| `skills/spec/references/brief.md` | Manual checks |
| `skills/route-skills/assets/handover-template.md` | - |
