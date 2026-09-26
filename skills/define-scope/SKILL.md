---
name: define-scope
description: "Use when a request, or new wishes for a stored brief, issue or plan, leaves a product decision open: what counts as done, data, architecture or a trade-off. When a new visual surface does not name its displayed data, settings, or behavior, define-scope decides those first; design-ui follows for presentation. Not for a clear goal, a failure, or visual-only work."
argument-hint: <outcome to shape>
---

# Shaping

Turn a request into a confirmed brief, so nobody codes through an unmade decision. The enemy is building on a guess. The overcorrection is asking what the code already answers.

## Gate

- Zero open decisions means no interview and no brief; hand the goal to `build-change`.
  The exception is two or more order dependencies: write the brief unasked, from `## Task list` on.
  `A → B` is one when B cannot build, test or keep its data before A lands.
  An open decision is one the user would notice that neither request nor code settles.
- Asked for options, give directions, recommended first, and write no file.
- New wishes for briefed work reopen that brief, since two briefs for one outcome drift apart.

## Interview

1. **Ask or decide.** Ask only what is costly or irreversible; decide the routine, a visible but cheap point included.
   Costly means stored data format, a public interface, a paid service, a deletion, or access rights and security.
2. **Look facts up** in the code while the user answers.
3. **Root first.** Ask what other decisions hang on, and finish its branch first.
4. **Sort each open point into a bin.** Costly (step 1) asks; answerable by running something (which approach works, how it feels, whether it is fast enough) goes to `try-idea` and comes back as a decision, never a question; routine you decide and list as an assumption.
5. **Bundle every bin-1 question and bin-3 assumption into one message**, in the shape below.
   No bin-1 point with an assumption writes the brief unasked, no confirmation needed; no bin-1 point and no assumption follows the Gate.
6. **After a compaction**, list the decisions so far before the next message.
7. **Name the owning layer**; two or more structural shapes open `references/architecture-sketch.md`.
8. **Name a smaller alternative** when one exists.

## Question shape

The user never saw the code, so no name from it appears in any message, assumption lines included: no path, class, field, setting, role, status code or technical term, only what it means for the user.

- The message opens with each bin-1 question in turn, short and in everyday words, numbered when more than one.
  The exception is one context line above a question, when it needs it; earlier answers and code findings wait for the brief.
- Two or three one-line options per question, holding only what the user gets, lettered when the question is numbered.
- Recommended first, with the active output style's marker for a recommended choice; only without one, `(recommended)`.
- Under each question's options, one short unlabelled line says why, because a reason inside an option blurs the choice.
- After the questions, every bin-3 assumption as one plain line each, in what the user gets, under an "Assuming" line.
- Close with one reply line naming how to answer each question and that `ok` or `go` takes every recommendation and assumption.

```text
1. How should harbour masters get their tide alerts out of the app?

   a. Download their harbour's alerts as a spreadsheet. (recommended)
   b. Add the alerts to their own calendar.
   A spreadsheet opens anywhere and needs no setup.

Assuming, unless you say otherwise:
- The export uses the same date format the alert list already shows.
- The export button sits beside the existing refresh button.

Reply 1a or 1b, your own words, or ok to take every recommendation and assumption.
```

## Replies

- A reply names the question's number and letter, or answers in the user's own words, unambiguous about which question it answers; `ok`, or its synonym `go`, takes every recommendation and every assumption.
- That reply is the confirmation: the brief is written right after it, with no separate confirmation round.
- A reply that opens a new costly or irreversible point earns one more bundled message holding just that point.
- A question a reply leaves unanswered takes its recommendation; the reply still confirms, and the brief follows.
- "I don't know" on a point gets two everyday sentences on how its options differ, with one example the user would see, then that point once more.
  A second "I don't know" on the same point takes the recommendation, credited to exo.

## Task list

Every brief ends in a task list, written in the grammar `references/task-list.md` sets.

1. **Map first.** Run `node "${CLAUDE_SKILL_DIR}/scripts/repo-map.mjs"` before any dispatch and read the file at the path it prints.
   It lists tracked paths and their exported names, and writes only under the git directory, so plan mode runs it too.
   Outside a git repository it prints one `no map` line, and discovery starts at the dispatch.
2. **Locate, do not read.** Discovery beyond the map goes to the `exo:locate-code` agent, never for a path the map names.
   Brief it with the files, symbols and call sites the tasks will name, and have it quote the range around each.
3. **Read at most eight ranges here**, one name each and never through `cat`, `head` or `sed`, since each read rides in every later turn.
   A name reaches a task only after its range was read, here or in that report.
4. **Put security in the task.** A task crossing a security boundary names the security reference in its heading or `Data:` segment.
   The builder then reads that reference with the files, before it writes a line.
5. **Plan mode edits nothing.** While it is active, run only commands that leave the working tree unchanged.
   When a proof needs an edit, that edit is the first task.

## Spec

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message.
The exception is Claude Code's plan mode: the brief goes into the plan file the harness names, the one file that mode lets you write.
`docs` writes `docs/specs/<topic>.md`; `issues` and `both` follow `references/brief-in-an-issue.md`.
`issues` also writes the brief to the path `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" specs/<n>.md` prints; `run-plan` runs that copy, and the issue stays the source.
Run `node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --plan <brief file>` and repair each line it prints.
Then check each Acceptance item reaches a task heading, a `Data:` segment or the Success criterion, and repair a miss now, because the builder cannot.
Then load `exo:run-plan` on that file with the Skill tool, in this turn and unasked: no decision is left open, and the context watch reads a plan run from that load.
The exception is plan mode or another read-only planning mode: end on the output of `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after define-scope --artifact <brief path, or #<n> for an issue>`.

## References

| File | Read it when |
|---|---|
| `references/stored-brief.md` | The request names or extends a brief, issue or plan. |
| `references/brief.md` | Before writing the brief. |
| `references/task-list.md` | Before writing the task list. |
| `references/example-plan.md` | Once, before the first task. |
| `../build-change/references/data-migration.md` | After affected paths are known and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |
| `../build-change/references/test-design.md` | Before the first task, to decide which tasks are risky and therefore write their test first. |
| `../build-change/references/security.md` | After affected paths are known and before ordering, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify. |
| `references/brief-in-an-issue.md` | `specs` is `issues` or `both`. |
| `../file-issues/references/fields.md` | Before creating that issue. |
| `references/architecture-sketch.md` | Two or more structural shapes compete. |

## Judgment

- `find-cause` outranks this skill when existing behavior fails and the cause is unproven.
- A decision the user left undecided stays open whatever the code suggests.
