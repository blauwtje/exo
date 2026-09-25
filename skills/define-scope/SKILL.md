---
name: define-scope
description: "Use when a request, or new wishes for a stored brief, issue or plan, leaves a product decision open: what counts as done, data, architecture or a trade-off. When a new visual surface does not name its displayed data, settings, or behavior, define-scope decides those first; design-ui follows for presentation. Not for a clear goal, a failure, or visual-only work."
argument-hint: <outcome to shape>
---

# Shaping

Turn a request into a confirmed brief, so nobody codes through an unmade decision. The enemy is building on a guess. The overcorrection is asking what the code already answers.

## Gate

- Zero open decisions means leave this skill and write no brief; hand the goal to `draft-plan` or `build-change`.
  An open decision is one the user would notice that neither request nor code settles.
- Asked for options, give directions, recommended first, and write no file.
- New wishes for briefed work reopen that brief, since two briefs for one outcome drift apart.

## Interview

1. **Ask or decide.** Ask what the user would notice or is costly to reverse; decide the routine.
   Costly means stored data format, a public interface, a paid service or a deletion.
2. **Look facts up** in the code while the user answers.
3. **Root first.** Ask what other decisions hang on, and finish its branch first.
4. **Keep going** until you and the user picture the same build.
5. **One question per message**, in the shape below.
6. **After a compaction**, list the decisions so far before the next question.
7. **Name the owning layer**; two or more structural shapes open `references/architecture-sketch.md`.
8. **Name a smaller alternative** when one exists.

## Question shape

The user never saw the code, so no name from it appears in any message, checkpoint included: no path, class, field, setting, role, status code or technical term, only what it means for the user.

- A question message holds question, options, why line and reply line, opening with the question, short and in everyday words.
  The exception is one context line above, when the question needs it; earlier answers and code findings wait for the checkpoint.
- Two or three one-line options holding only what the user gets.
- Recommended first, with the active output style's marker for a recommended choice; only without one, `(recommended)`.
- Under the list, one short unlabelled line says why, because a reason inside an option blurs the choice.
- Close with the example's reply line, its digits matching the options.

```text
How should harbour masters get their tide alerts out of the app?

1. Download their harbour's alerts as a spreadsheet. (recommended)
2. Add the alerts to their own calendar.
A spreadsheet opens anywhere and needs no setup.

Reply 1 or 2, in your own words, or go to take every recommendation.
```

## Replies

- A digit or own words answer the question; `ok` takes the recommended option.
- `go` takes the recommendation for every open decision, asked or not, and brings the checkpoint at once.
- "I don't know" gets two everyday sentences on how the options differ, with one example the user would see, then the same question again.
  A second takes the recommendation, credited to exo.

## Checkpoint

List each decision on its own plain line with who decided it: you, `code` or exo.
Then ask in the question shape, reply line included: 1 write the brief (recommended), 2 change something; nothing is written before the yes.

## Spec

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message.
`docs` writes `docs/specs/<topic>.md`; `issues` and `both` follow `references/brief-in-an-issue.md`.
End on the output of `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after define-scope --artifact <brief path, or #<n> for an issue>`.

## References

| File | Read it when |
|---|---|
| `references/stored-brief.md` | The request names or extends a brief, issue or plan. |
| `references/brief.md` | Before writing the brief. |
| `references/brief-in-an-issue.md` | `specs` is `issues` or `both`. |
| `../file-issues/references/fields.md` | Before creating that issue. |
| `references/architecture-sketch.md` | Two or more structural shapes compete. |

## Judgment

- `find-cause` outranks this skill when existing behavior fails and the cause is unproven.
- A decision the user left undecided stays open whatever the code suggests.
