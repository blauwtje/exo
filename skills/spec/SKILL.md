---
name: spec
description: "Turns a request into a brief: the user's decisions, then tasks that each carry a proof command. Use when the user says 'plan this' or 'write a spec', or a request leaves a choice open."
argument-hint: "outcome to shape"
---

# Spec

**Every task gets a command that fails today and passes when the task is done.** A plan without that is a wish list. Your job is to find what only the user can decide, get those decisions, and write tasks that `exo:build` can prove one by one. You write no code: the brief is the hand-off.

Read `${CLAUDE_PLUGIN_ROOT}/BASE.md` first.

**Look first.** Before you ask anything, look for an earlier brief or research on the same outcome: run `rg -il -e <word> docs/specs docs/research` and `rg --files docs/specs docs/research | rg -i <word>`. Edit a brief for the same outcome in place. When one already covers the request, say so and stop.

**Decide whether to plan at all.** Give a verdict, `go`, `clarify` or `stop`, plus the likeliest way this change fails. `clarify` asks the one question that makes it `go`. A small change with a known proof skips the interview and becomes one task.

**Find the open decisions.** Read the code with `rg`. Facts the code or the docs can answer are your job, never the user's. For more than three tasks, send one `exo:researcher` per code area and one for outside facts, in parallel, and keep only the claims they label measured. Keep notes in `<scratch>/<topic>-notes.md`. What is left are the decisions only the user can make: what done looks like, which data it touches, the architecture, a trade-off. For design options, sketch two or three under different constraints, score them on criteria you set before sketching, and let the user pick.

**Ask.** Put all open decisions in one message, each in this shape, worded so `ok` accepts your recommendation:

```markdown
**Which delimiter should the CSV export use?**
Excel in Dutch locales splits comma files wrong and opens semicolon files right.
- **(A) Semicolon**: opens right in Dutch Excel; other tools need a setting.
- **(B) Comma**: the standard; breaks in Dutch Excel.
Recommended: A, because the users in the request work in Dutch Excel.
```

Take no default on a decision that is the user's. A second "I don't know" on one decision goes under `## Open points` and blocks the tasks that depend on it.

**Write the brief.** Write `docs/specs/<topic>.md` (in plan mode, the plan file), with the sections and task format in [references/brief.md](references/brief.md). Each task is the smallest change its proof can prove. Run each proof once and see it fail. For more than three tasks, send a fresh `exo:researcher` to read the brief as a builder who cannot ask questions, and put its questions to the user the same way.

**Hand off.** When another skill invoked you, return to it. Otherwise end with the brief path, then one code block holding a paste-ready prompt that runs `exo:build` on that path, then the line `Sonnet, medium`, so the build starts in a fresh session with a clean context.

When `exo:build` reports `PLAN WRONG`, edit only the tasks with no `Plan-task:` commit yet, and add a dated line under `## Log`.

## Excuses

| You think | Do instead |
|---|---|
| "The user surely wants X." | A guessed decision gets rebuilt. Ask. |
| "I'll ask about the code layout." | Read the code. Facts are your job. |
| "This proof obviously fails today." | Run it. A proof that already passes proves nothing. |
| "Writing the code is faster." | The brief is the hand-off. Write no code. |
