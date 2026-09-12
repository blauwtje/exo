# Builder prompt

The text `designing` hands a `general-purpose` delegate on `sonnet` for one build scope: the foundation, one surface, or `all`. The session fills `RUN`, `SCOPE`, `FILES`, `REFERENCES` and `SKILL` before sending it.

```text
A hard turn ceiling ends the run without warning. Read the contract, the inventory slice, the foundation report, the `FILES` ranges, and the named references first, batch reads, then write; by the fortieth turn stop reading and finish the report, and with `SCOPE` `all` by the fortieth of each scope.

**Input contract.**

Expect: `RUN` (an absolute run directory), `SCOPE` (`foundation`, a surface name, or `all`), `FILES` (the repository paths with line ranges the session read for this scope; read each range with Read's offset and limit, which is also what an Edit to that file requires, and open no whole file the list does not name whole), `REPO` (the repository root), `SKILL` (the skill directory, `~/.claude/skills/designing` unless the brief names another), and `REFERENCES` (the rows of the skill's reference table whose predicate this scope meets; read those files under `$SKILL/references/` and no other; `$SKILL/references/craft-recipes.md` by section, the foundation scope whole and a surface scope only the treatment it builds). `$RUN/contract-selected.json` holds the direction; `$RUN/inventory.md` holds the content inventory, and the brief names your slice; `$RUN/foundation.md` exists for a surface scope and names the tokens file, base layer, and primitives you must use instead of re-deriving. The floor below binds every scope.

**Foundation scope.**

Write the tokens file, the base layer, and every primitive the inventory repeats across surfaces, in the repository's styling architecture from `$SKILL/references/implementation.md`. Build the recorded motion decision's tokens. Write `$RUN/foundation.md`: the paths written, each token group in one line, each primitive with its state row, and what a surface builder must not redefine. At most 20 lines.

**Surface scope.**

Build the surface from its inventory slice on top of the foundation: every content obligation, every reachable state of every repeated component, the technique the subject's world names built as itself. Never edit the foundation files; a missing primitive is reported, not added locally. Write `$RUN/build-<SCOPE>.md`: the paths written, the inventory items covered and any missing, the floor checks you could confirm from source, and the primitives you needed but the foundation lacks. At most 20 lines.

**All scope.**

With `SCOPE` `all`, build the foundation scope first and then every surface the inventory names, one after the other in this run, and write `$RUN/foundation.md` plus one `$RUN/build-<surface>.md` per surface, each at most 20 lines.

**The floor.**

Every scope meets the floor; its state, timing, and reachability mechanics live in `$SKILL/references/interaction-qa.md`:

- no horizontal scroll from 360px through 1440px;
- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;
- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;
- targets at least 24×24 CSS px — the WCAG 2.2 AA minimum, exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation — with 44×44 as the enhanced target and the default under a coarse pointer;
- reduced-motion handling for every animation and semantic HTML beneath styling;
- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;
- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property; anything costlier carries the cost disclosure `$SKILL/references/performance-budget.md` defines.

The underdesign floor: the ground is a designed surface, not an untouched flat neutral; raised surfaces carry the direction's material, not one grey shadow each; type carries a voice through a second weight, width, or family; the recorded motion decision is built; every browser surface on the finish list in `$SKILL/references/implementation.md` is themed; and no slop trope from `$SKILL/references/visual-critique.md` stands without recorded provenance. `text-wrap: pretty`, CSS grid and subgrid, `color-mix()`, masks, and scroll-driven animation are the idiom, not enhancements to ration; the shapes live in `$SKILL/references/craft-recipes.md`.

**The ladder.**

The ladder, before every edit that adds or replaces code: read the ranges it touches, then stop at the first rung that holds.
1. Need: the request names a present use; a use imagined for later is skipped and named in the report.
2. Present: a symbol, pattern or type in this repository already does it, found by one search for its name or role: reuse it.
3. Standard library: the language's standard library does it: call it.
4. Platform: a native feature does it, such as a date input over a picker component, CSS over script, or a database constraint over application code: use it.
5. Installed: a dependency already in the manifest does it: use it, and add no new one for what ten lines cover.
6. Minimum: the fewest statements that pass the checks, one thing per line, full-word names, a guard clause over nesting.
Trust-boundary validation, error handling that prevents data loss, security, accessibility and anything asked for by name are built in full at whatever rung the code lands on.

**Rules.**

- Do not render, screenshot, or start a browser; the reviewer renders.
- Do not run a production build, a bundler, or a type check; the reviewer renders the surface and the session runs the repository's checks after every builder has returned.
- Do not read a reference the brief did not name.
- Do not delete a container, volume, database, branch, or credential to get past a blocked state; report it with two options.
- Return two lines: the report path and the count of paths written. No code, no diff, no summary prose.
```
