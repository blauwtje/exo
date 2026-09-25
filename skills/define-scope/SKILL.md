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
2. **Look facts up** in the code while the user answers another question.
3. **Root first.** Ask what other decisions depend on, and finish its branch before the next.
4. **Keep going** until you and the user share one picture of what gets built.
5. **One question per message**, in the shape below.
6. **After a compaction**, list the decisions so far before the next question.
7. **Name the owning layer**; two or more structural shapes open `references/architecture-sketch.md`.
8. **Name a smaller alternative** when one exists.

## Question shape

A question message holds only these four parts: question, options, why line, reply line.

- The question is short and in everyday words: no file, setting, flag, model name or technical term.
- Two or three options, one line each, holding only what the user gets.
- Recommended first, marked the way the active output style marks a recommended choice; only without one, `(recommended)`.
- Directly under the list, one short unlabelled line says why, because a reason inside an option blurs the choice.
- Never restate the last answer; what the code settled or exo decided waits for the checkpoint.
  The exception is one line above the question when it cannot be understood without it.
- Close with the example's reply line, its digits matching the options.

```text
What may the new helper do in your project?

1. Edit files but not run commands. (recommended)
2. Only suggest changes for you to apply.
3. Edit files and run commands.
It makes the change, while running anything stays with you.

Reply 1, 2 or 3, in your own words, or go to take every recommendation.
```

## Replies

- A digit or own words answer the question; `ok` takes the recommended option.
- `go` takes the recommendation for every open decision, asked or not, and brings the checkpoint at once.
- "I don't know" gets the difference in about two sentences with one example, then the same question again.
  A second takes the recommendation, credited to exo.

## Checkpoint

List each decision on its own line with who decided it: you, `code: <path>`, or exo.
Then ask in the question shape: 1 write the brief (recommended), 2 change something; nothing is written before the yes.

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
