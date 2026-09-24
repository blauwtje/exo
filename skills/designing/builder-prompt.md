# Builder prompt

A `general-purpose` delegate on `sonnet` opens this file directly, by path, for one build scope: the foundation, one surface, or `all`. The dispatch names `RUN`, `SCOPE`, `FILES`, `REFERENCES`, `REPO` and `SKILL`; the delegate reads them from the dispatch line, not from text pasted into it.

```text
The run has a fixed turn limit and ends mid-step, without notice, when it is reached. Read the contract, the inventory slice, the foundation report, the `FILES` ranges, and the named references first, batching the reads, then write; stop reading by turn forty and finish the report, and with `SCOPE` `all` by turn forty of each scope.

**Input contract.**

Expect: `RUN` (an absolute run directory), `SCOPE` (`foundation`, a surface name, or `all`), `FILES` (the repository paths with line ranges the session read for this scope; read each range with Read's offset and limit, which is also what an Edit to that file requires, and open no whole file the list does not name whole), `REPO` (the repository root), `SKILL` (the absolute skill directory, which the brief always names), and `REFERENCES` (the rows of the skill's reference table whose predicate this scope meets; read those files under `$SKILL/references/` and no other; `$SKILL/references/craft-recipes.md` by section, the foundation scope whole and a surface scope only the treatment it builds; `$SKILL/references/visual-critique.md`'s `## Slop tropes` section, to check the tropes the floor below requires provenance for). `$RUN/contract-selected.json` holds the direction; `$RUN/inventory.md` holds the content inventory, and the brief names your slice; `$RUN/foundation.md` exists for a surface scope and names the tokens file, base layer, and primitives you must use instead of re-deriving. The floor below binds every scope.

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

The ladder, before every edit that adds or replaces code: read the ranges the edit touches first, then take the first rung that fits; when two rungs hold, the lower number wins.
1. Need: build only for a use the request names today; a later use stays out and is listed in the report.
2. Reuse: when a symbol, pattern or type in this repository already does the job, found with one search by name or role, build on it rather than writing a second.
3. Borrow: otherwise take the first existing source that does it: the standard library, a native platform feature, CSS over script or a database constraint over application code, then a dependency the manifest lists, with no new dependency for what ten lines cover.
4. Write: only then write it: the fewest statements the checks accept, one action per line, no call chained into a call into an index, full-word names, guard clauses over nesting.
Trust-boundary checks, failure handling that keeps data from being lost, anything security depends on, accessibility, and every part the user named are built completely on any rung. A shortcut with a known limit carries one comment naming the limit and how to lift it.

**Rules.**

- Do not render, screenshot, or start a browser; the reviewer renders.
- Do not run a production build, a bundler, or a type check; the reviewer renders the surface and the session runs the repository's checks after every builder has returned.
- Do not read a reference the brief did not name.
- Do not delete a container, volume, database, branch, or credential to get past a blocked state; report it with two options.
- Run no git command that writes: no `add`, `commit`, `switch`, `checkout`, `stash`, `reset`, `restore`, `branch`, `push`, `worktree`, and no `gh` command at all. Read-only git is yours.
- Return two lines: the report path and the count of paths written. No code, no diff, no summary prose.
```
