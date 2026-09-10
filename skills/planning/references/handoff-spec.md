# Plan artifact specification

Give a zero-context executor every verified name, edge, and check needed to edit without invention. The enemy is a goal statement that exports discovery to the executor. The overcorrection is loading this depth for a two-edit inline order the current session executes immediately.

The artifact must read the same however the request was phrased, and execute the same whether the executor is this session after approval, a fresh session, or a different model. Write for a reader with zero conversation context: no "as discussed", no "above", no reference back to the request — every referent is a path, symbol, or command named inside the plan. The plan carries each edit as text the executor pastes, never as a description of it: a prose `Target:` that a weaker model or a cleared context must translate into code is the discovery this artifact exists to remove.

## Required sections, in order

1. `## Goal` — one sentence naming the observable result.
2. `## Plan basis` — opens with two lines on their own, `Repository: <absolute repository root>` and `Branch: <branch name>`, which `implementing` greps to match a plan to a checkout; then the ref, relevant dirty or untracked state, pinned external tool/library versions and dates the plan depends on, and the drift policy: what counts as `PLAN DRIFT`, and whether recovery is "make no edit" (drift found before a checkpoint's edits) or "revert only that checkpoint's changes and restore the last verified green state" (drift found after); closes with the literal sentence "Executor loads the `implementing` skill on this plan before the first checkpoint." so a fresh session that opens on the plan runs it under that skill, which owns the branch, the commits, the review and the pull-request question.
3. `## Non-goals` — adjacent work that stays unchanged; the executor treats these as hard boundaries.
4. `## Context` — the verified facts the plan depends on: current behavior, owning files and symbols, and the repository conventions the edits must follow. Only facts confirmed during the planning session belong here.
5. `## Visual direction` — required when a checkpoint carries `Freedom: DESIGN`, and when a `Touches:` path ends in `.css`, `.scss`, `.sass`, `.less`, `.html`, `.htm`, `.tsx`, `.jsx`, `.vue`, `.svelte`, or `.astro`, including behind a `?query` or `#fragment` suffix, in a checkpoint whose `Target:` does not state "no visual change": exactly one `Design skill: <name>` line naming the frontend-design skill this plan's DESIGN checkpoints load — the literal `none` only when `## Open questions` carries a clarification marker asking which skill to load — plus the chosen direction or world in one line, the evidence that choice rests on, the list of choices an executor may not invent, and, when the planning turn froze a direction contract, one `Contract: <repository-relative path>` line naming the JSON file the first DESIGN checkpoint creates.
6. `## Steps` — dependency-ordered checkpoints, each formatted per the template below.
7. `## Final verification` — the commands proving the whole change, with expected observable results, closing with a literal `Walkthrough:` line: the one command or URL a person runs or opens to see the delivered result, without a manual login or a Swagger detour (a seeded demo script, a curl or browser walkthrough, or a minimal view). A plan whose checkpoints ship only API, schema, or data changes still carries it and adds the minimal checkpoint that makes the result visible; `Walkthrough: none` is valid only when the change has no user-visible result, and then states why on the same line.
8. `## Open questions` — every `[NEEDS CLARIFICATION: ...]` marker, or the word None.

## Checkpoint template

Each checkpoint in Steps uses exactly this format:

````
### <id> — <title>

Freedom: LOCKED | GUIDED | OPEN | DESIGN
Depends on: none | <id>[, <id> …]

Touches:
- `<path>` — anchor: <type> (<anchor detail; planning line numbers advisory only>)

Current: <verified current state the executor must find>
Target: <one sentence: the observable state after the edit>
Wiring: <callers/consumers affected, or none>

Edit:
- `<new path>` — create:
  ```<lang>
  <the whole file>
  ```
- `<existing path>` — replace:
  ```<lang>
  <verbatim current text, copied from the file this session, unique in that file>
  ```
  with:
  ```<lang>
  <the new text>
  ```

Verify: <command> → <expected observable result>
On drift: <mismatch condition> → <recovery>, stop, report `PLAN DRIFT: <id>`
Done when: <one observable completion condition>
````

`Freedom:` carries exactly one token, nothing else on the line:

- **LOCKED** — paste the `Edit:` text verbatim: user decisions, public APIs, migrations, persisted formats, security boundaries, required copy, exact commands.
- **GUIDED** — the `Edit:` text is the intended change; names, formatting, and idiom may adapt to repository conventions, behavior may not.
- **OPEN** — the `Edit:` text is a reference implementation; the executor may restructure it inside the outcome and boundaries `Target:` and `## Non-goals` fix.
- **DESIGN** — the direction fixed in `## Visual direction` holds and the `Edit:` text fixes structure, class names, and copy; the visual values inside that direction are decided by the frontend-design skill `## Visual direction` names, and this checkpoint loads that named skill immediately before its first UI edit.

`Edit:` carries one entry per touched path, in the two forms the template shows, and nothing outside the entry lines and fenced blocks. A `new-file` anchor uses `create:` with the whole file; every other anchor uses `replace:` with the verbatim current text, then `with:` and the new text — an empty `with:` block deletes the quoted text. The same path may repeat for a second hunk. The current-text block is the executor's locator: text not found, or found more than once, is `PLAN DRIFT` before any edit. A checkpoint with `Touches: none` carries no `Edit:` field.

`<id>` is a kebab-case slug naming the checkpoint's task, like `add-refund-column`, so `Depends on:` and `PLAN DRIFT:` references read as tasks: lowercase, at least two hyphen-separated words, never a sequence code (`CP1`, `step-2`). `Depends on: none` is valid; the field never stays empty or names no id, since both silently read as `none` and drop an ordering edge. Each section heading this grammar names — required or conditional — appears exactly once. Anchor `<type>` is one of `symbol`, `selector`, `template block`, `config key`, `exact string`, `new-file` — a newly created file always uses `new-file`; every other touched path uses one of the other five. A checkpoint that changes nothing writes `Touches: none` and states "no repository change" in `Target:`; no checkpoint that edits may write `Touches: none`.

A DESIGN checkpoint replaces its `Verify:` line with a literal `Render: <surface> at <viewports> → <observable visual outcome>` line. Every other checkpoint keeps `Verify:` and carries no `Render:` line.

Optional `RED:`, `GREEN:`, `VERIFY:` substep lines may appear between `Wiring:` and `Verify:` when a checkpoint lands a failing test before implementing it. Every checkpoint still ends green.

## Rules

1. **Anchor priority.** Cite a stable symbol, selector, template block, config key, or exact string first; fall back to a current signature or a short current-text fingerprint only when no stable anchor exists. A planning-time line range is advisory metadata alone and never the sole locator.
2. **Verified anchors only.** Quote the current signature or text; never name an unread symbol. The same holds for every dependency version, schema field, fixture key, and environment variable the plan names: read it from the lockfile, migration, or fixture in this repository before writing it into a step, since an invented value still validates and fails only at the executor's first run.
3. **The edit is the spec.** `Target:` is one sentence naming the observable state; the validator rejects a longer one. Every behavior, wording, or structural detail lives in `Edit:` as the text itself, so an executor with less reasoning or no conversation context pastes rather than designs.
4. **Phased and green.** When credentials, hardware, or accounts gate later work, fully specify only the next executable checkpoint and summarize gated checkpoints until their prerequisites pass.
5. **Rationale where required.** Explain any touched file the request did not name and any edit not forced by a changed signature, dependency edge, or call site, in `Current:`, `Target:`, `Wiring:` or `## Context`, never as a comment inside `Edit:` text: the executor pastes that text, and a comment naming an issue, a spec line, or what the change replaces outlives the change and then reads as a fact about the code. A comment in `Edit:` text states only a constraint or invariant of the code as it stands; the story belongs in the commit the executor writes.
6. **No placeholders.** Replace "appropriate handling", "similar to", "etc.", and TODO-shaped steps with exact behavior or `[NEEDS CLARIFICATION: ...]`.
7. **Repository conventions.** Name how each component connects to documented test registration, error types, process wrappers, logging, and file layout. Do not invent a parallel pattern.
8. **Frontend entry.** Every checkpoint touching a frontend path is itself a DESIGN checkpoint or reaches one through `Depends on:`; a checkpoint whose `Target:` states "no visual change" is exempt.
9. **Effort proportional to risk.** Author the plan at the session's configured reasoning effort. Raise it one level for a plan that crosses an irreversible migration, a security or trust boundary, or an architecture decision the read evidence does not settle.

## Judgment

- Verified repository evidence outranks remembered symbols and generic patterns.
- Explicit user decisions outrank inferred implementation choices.
- A clarification marker outranks inventing a name, behavior, credential, or external fact.
- A green checkpoint outranks a tidy diff: never leave the repository red to finish a checkpoint sooner.
