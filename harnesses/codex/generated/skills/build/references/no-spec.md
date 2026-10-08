# No spec

A decided change with no plan file runs these steps instead of the loop.

1. **Orient.** A main session runs `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/lib/scratch-exclude.mjs"`.
   - Read only ranges a plan task's `Files:` lines or the request name.
   - `<scratch>/implement-next.md` present → resume from it, delete it once edits land; `<scratch>` = what `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/lib/scratch-path.mjs"` prints.
   - Otherwise, or after one failed direct search, dispatch `exo-locate-code`; read only its `Read next` ranges plus direct callers or callees.
   - Upstream Decisions → settled.
2. **Gate.**
   - Open product decision → `spec` first; the earliest stage wins.
   - Zero facts → edit directly, run the check, report, stop.
   - Otherwise draw `A → B` when edit B cannot land green before A; two or more edges → `spec`, unless a brief orders them.
   - Test-first request → continue at any count; the direct route has no red run.
3. **Workspace, then baseline.** Before the first edit, settle where the change commits; when that asks, await the answer.
   - Multi-file change → confirm a clean working tree or name its pre-existing changed paths.
4. **Build.**
   - Required edit outside oriented paths → report it before touching it.
   - Edit in dependency order; no asking between files in scope.
   - Hand edit repeated across many files → one script.
   - Keep every mutating edit idempotent, so retries land the same state.
   - Hook reports the context budget crossed → at a green state write landed and open edits to `<scratch>/implement-next.md`, report that a clear comes next.
5. **Prove.**
   - *Done* needs a `Proof: <command or MCP tool> -> <output>` line from a real call this session made on input it did not write, else `Unverified: <reason>` with no Done.
   - Proof is not a test runner, unless `package.json` names no `bin` and no `scripts.start`.
   - Risky change → quote failing output before the first production edit, passing output after.
   - Test-first bug → commit its failing test alone; a test committed with its fix never shows it failed.
   - Otherwise exercise the feature, else run a test that failed before, else type check and build.
   - Run runners unpiped and without `cd &&`, which hide the failing command.
6. **Project knowledge.**
7. **Fresh eyes.**
8. **Commit.** Commit where step 3 placed it, leaving out its pre-existing paths, then end on `ship`, unless the request rules out a push; then say nothing left the machine.
