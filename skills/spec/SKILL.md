---
name: spec
description: "Shapes a request into a brief: the decisions only the user can make, then a plan of tasks that each carry a proof command. Use when the user asks to plan or spec a change ('plan this', 'write a spec'), when a request leaves done, data, architecture or a trade-off open, the user is unsure how to build or change something and asks for help deciding, or the user asks for design options for a change. Not for ideas on another question (exo:ideas)."
argument-hint: "outcome to shape"
---

## Principles

- Ask only what code and the web cannot show, one question at a time, because the user should answer each in full.
- Take no default on a user choice, because a guessed decision gets rebuilt.
- Each task carries a Proof that fails before it and passes after, because build cannot otherwise tell done.
- Write no code, because the brief is the hand-off.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/BASE.md`.
2. Run `rg -il -e <word> docs/specs docs/research` and `rg --files docs/specs docs/research | rg -i <word>`. Edit a brief for the same outcome in place; a file that covers the request means `stop`.
3. State a verdict (go, clarify or stop) and an objection, the likeliest failure. `clarify` asks the one question that makes it `go`. A small change with a known proof skips to step 6 as one task.
4. **Find the open decisions.** Read the code with `rg`. Beyond 3 tasks, send one `exo:researcher` per code area (Haiku, high) and one for outside facts, keep only claims labelled measured, and keep notes in `<scratch>/<topic>-notes.md`. For design options, sketch 2 or 3 under different constraints, score them on criteria set first, ask the user to pick and stop.
5. Ask each open choice in one message: a bold title ending in `?`, context, two or three lines `- **(A) Label**: what the user gets`, then the recommended letter and why. `ok` takes it; a second "I don't know" goes under `## Open points` and blocks the build.
6. Write `docs/specs/<topic>.md` (in plan mode, the plan file) with Goal, Verdict, Decisions, Non-goals, Facts (each with `path:line` or URL), Acceptance, Manual checks, Plan basis (`Repository:`, `Branch:`, `Land gate:`), Success criterion (one command) and Tasks.
7. Each task is `### Task <n>: <commit subject>` and one line `Depends on: | Files: | Data: [| Red: none (<reason>)][| Model: <model> <effort>] | Proof: <command>`: the smallest change its Proof proves, every written path in Files.
8. Run each Proof once and see it fail. Beyond 3 tasks, a fresh `exo:researcher` reads the brief as a builder who cannot ask; ask its questions as in step 5.
9. Invoked by another stage, return. Else end with the brief path, one code block holding a paste-ready prompt that runs `exo:build` on that path, and the line `Sonnet, medium`.
10. On `PLAN DRIFT`, edit only tasks with no `Plan-task:` commit and add a dated `## Log` line.
