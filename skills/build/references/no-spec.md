# No spec

A decided change with no plan file runs these steps instead of the loop above.

1. **Orient.** A main session runs `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"`.
   - Read only ranges a plan task's `Files:` lines or the request name.
   - Resume from `<scratch>/implement-next.md` if present (`<scratch>` is what `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs"` prints), deleting it once edits land.
   - Otherwise, or when one direct search failed, dispatch `exo:locate-code` and read only its `Read next` ranges plus direct callers or callees.
   - Treat upstream Decisions as settled.
2. **Gate.**
   - Zero facts: edit directly, run the check, report and stop.
   - Otherwise draw `A → B` when edit B cannot land green before A; two or more edges go to `spec` unless a brief orders them.
   - A test-first request continues at any count, because the direct route has no red run.
3. **Workspace, then baseline.** Before the first edit, settle where the change commits, awaiting the answer when it asks.
   - For a multi-file change, confirm a clean working tree or name its pre-existing changed paths.
4. **Build.**
   - Report a required edit outside oriented paths before touching it.
   - Edit in dependency order without asking between files in scope.
   - A hand edit repeated across many files becomes one script.
   - Every mutating edit stays idempotent so retries land the same state.
   - Comments state a constraint, invariant or reason, never the change's story, because they outlive the change.
   - When a hook reports the context budget crossed, write landed and open edits to `<scratch>/implement-next.md` at a green state and report that a clear comes next.
5. **Prove.**
   - *Done* needs a `Proof: <command or MCP tool> -> <output>` line from a real call this session made on input it did not write, not a test runner, else `Unverified: <reason>` with no Done.
   - A risky change quotes failing output before the first production edit and passing output after.
   - A test-first bug commits its failing test alone, because a test committed with its fix never shows it failed.
   - Otherwise exercise the feature, else run a test that failed before, else type check and build.
   - Run runners unpiped and without `cd &&`, which hide the failing command.
6. **Project knowledge.**
7. **Fresh eyes.**
8. **Commit.** Commit where step 3 placed it, leaving out its pre-existing paths, then end on `ship`.
