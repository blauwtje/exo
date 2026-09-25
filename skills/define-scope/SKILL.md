---
name: define-scope
description: "Use when a request, or new wishes for a stored brief, issue or plan, leaves a product decision open: what counts as done, data, architecture or a trade-off. When a new visual surface does not name its displayed data, settings, or behavior, define-scope decides those first; design-ui follows for presentation. Not for a clear goal, a failure, or visual-only work."
argument-hint: <outcome to shape>
---

# Shaping

Turn a request into a brief the user confirmed, so nobody codes through an unmade decision. The enemy is building on a guess. The overcorrection is asking what the code already answers.

## Gate

- Zero open decisions means leave this skill and write no brief; hand the goal to `draft-plan` or `build-change`.
  An open decision is one the user would notice that neither request nor code settles.
- Asked for options, give directions, recommended first, and write no file.
- New wishes for briefed work reopen that brief, since two briefs for one outcome drift apart.

## Interview

1. **Ask or decide.** Ask what the user would notice, or what is costly to reverse; decide everything routine.
   Costly means stored data format, a public interface, a paid service or a deletion.
2. **Look facts up** in the code, asking another question meanwhile so the user never waits.
3. **Root first.** Ask what other decisions depend on, and finish its branch before the next.
4. **Keep going** until you and the user share one picture of what gets built; answers open new questions.
5. **One question per message**, never repeating the previous question or its answer.
6. **After a compaction**, list the decisions so far, one line each, before the next question.
7. **Name the owning layer**; two or more structural shapes open `references/architecture-sketch.md`.
8. **Name a smaller alternative** when one exists.

## Question shape

- One short question in everyday words: no paths, identifiers or jargon.
- Two or three options, one short line each saying what the user gets.
- Recommended first, marked only `(recommended)`, with one line under it saying why.
- At most one line of context above the question, only when it is unclear without it.

```text
What may the DeepSeek worker do in your project folder?

1. Read and edit files, but not run commands. (recommended)
   It can make the change, while anything it runs stays with you.
2. Only read files. It suggests changes and you apply them.
3. Read, edit and run commands. Fastest, but it can change more on its own.

Reply 1, 2 or 3, in your own words, or go to take every recommended answer.
```

## Replies

- A digit or own words answer the question; `ok` takes the recommended option.
- `go` takes every open recommendation and moves to the checkpoint.
- "I don't know" gets the difference in two sentences with one product example, then the question again; a second takes the recommendation, as exo's.

## Checkpoint

List each decision on one line with who decided it: you, `code: <path>`, or exo.
Then ask: 1 write the brief (recommended), 2 change something; nothing is written before the yes.

## Spec

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message.
`docs` writes `docs/specs/<topic>.md`; `issues` and `both` follow `references/brief-in-an-issue.md`.
End on the output of `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after define-scope --artifact <brief path, or #<n> for an issue>`.

## References

| File | Read it when |
|---|---|
| `references/stored-brief.md` | The request names a brief, issue or plan, or adds wishes to one. |
| `references/brief.md` | Before writing the brief. |
| `references/brief-in-an-issue.md` | `specs` is `issues` or `both`. |
| `../file-issues/references/fields.md` | Before creating that issue. |
| `references/architecture-sketch.md` | Two or more structural shapes compete. |

## Judgment

- `find-cause` outranks this skill when existing behavior fails and the cause is unproven.
- A decision the user left undecided stays open whatever the code suggests.
