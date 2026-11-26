# spec

Decides what to build before any code is written, and writes it down as a brief.

## When it runs

A request leaves a product decision open: what counts as done, which data, which architecture, or a trade-off. It also runs when you ask for design options for a change; ideas on any other question go to `exo:ideas`.

Not for a clear goal, a bug, or visual-only work.

## What you get

- Before anything else, a `Verdict:` of go, clarify or stop and the strongest `Objection:` against the work. Clarify asks one question; stop writes no brief and says why.
- One question at a time, at most 3 per round, with lettered options and a recommendation. Reply with a letter, or `ok` to take the recommendation. Spec takes no default of its own: it asks each choice that code or the web cannot prove, and looks up the rest.
- After the draft brief, a read-only agent (`exo:researcher`, skipped for a plan of at most 3 tasks) reads it as a builder who cannot ask. Each point it proves goes under `## Facts` with its `path:line` or URL; you are asked the rest.
- A question you leave unanswered, or any beyond the first 3, stays under `## Open points`, and build refuses the brief until it is answered.
- A brief with a task list, each task carrying its exact interface and a proof command, stored where the `specs` setting says: `docs/specs/`, a GitHub issue, or both. New wishes for existing work update the existing brief.
- A repo's definition-of-done file under `docs/plans/` is chained onto the Success criterion once.
- A closing prompt in one code block that runs `exo:build` on the brief in a fresh session, with the model and effort to use. Spec starts no build itself.

Asked for options, spec drafts two or three distinct ones, recommends one, and writes nothing until you pick.

## Source

`skills/spec/SKILL.md` and its `references/`.
