# spec

Decides what to build before any code is written, and writes it down as a brief.

## When it runs

A request leaves a product decision open: what counts as done, which data, which architecture, or a trade-off. It also runs when you ask for options or ideas.

Not for a clear goal, a bug, or visual-only work.

## What you get

- Before anything else, a `Verdict:` of go, clarify or stop and the strongest `Objection:` against the work. Clarify asks one question; stop writes no brief and says why.
- One question at a time, with lettered options and a recommendation. Reply with a letter, or `ok` to take the recommendation. Facts it can look up are looked up, not asked.
- After the draft brief, a read-only agent (`exo:researcher`, skipped for a plan of at most 3 tasks with static proofs) finds every point a wrong guess would change. Points the code settles and cheap-to-undo guesses go under `## Assumptions`; you are asked only the rest.
- A question you leave unanswered stays under `## Open points`, and build refuses the brief until it is answered.
- A brief with a task list, each task carrying its exact interface and a proof command, stored where the `specs` setting says: `docs/specs/`, a GitHub issue, or both. New wishes for existing work update the existing brief.
- A repo's definition-of-done file under `docs/plans/` is chained onto the Success criterion once.
- A closing question: start the build now in the background, or say what to change. Build never starts before you reply.

Asked for options, spec drafts two or three distinct ones, recommends one, and writes nothing until you pick.

## Source

`skills/spec/SKILL.md` and its `references/`.
