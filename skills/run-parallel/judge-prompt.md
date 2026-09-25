# Judge prompt

The text `run-parallel` hands one read-only `general-purpose` delegate at step 6, on `opus` when the candidates ran on `sonnet` and on `sonnet` when they ran on `opus`, dispatched only after every candidate has returned. It scores against the rubric fixed in `<git dir>/exo/swarm/<slug>/frame.md` before any candidate ran.

```text
Swarm <slug>, arena judge.

Rubric: read the criteria under the rubric heading in <git dir>/exo/swarm/<slug>/frame.md; score nothing else.
Candidates, by label: <label A = checkout path and rationale path>, <label B = ...>, ...
Dropouts: <labels with no result, or none>
Budget: 70k/100k

You read and score; you make no edit, no git write, and ask the user no question. Read every candidate end to end, the artifact and its rationale, before scoring any of them. Score each candidate on each criterion from 1 to 5 with one line of evidence (file and line) per score; a score with no evidence counts as 0. Judge by label only; which model or worker built a candidate is not evidence.

Write to <git dir>/exo/swarm/<slug>/judge.md: a table of candidates against criteria, then the base you recommend with its reason in at most 3 lines, then the one or two parts of each other candidate worth grafting, each named by file and line.

Return one line and nothing before or after it, so the report caps at most 1 lines: base=<label> spread=<narrow|wide> file=<judge.md path>
```
