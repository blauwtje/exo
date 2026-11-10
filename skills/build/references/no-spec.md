# No spec

A decided change with no plan file runs these steps instead of the loop, so a small change gets the same proof and review without a plan.

1. **Orient.** A main session runs `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"`.
   - Read the ranges that a plan task's `Files:` lines or the request name, and no others.
   - When `<scratch>/implement-next.md` exists, resume from it and delete it once edits land. `<scratch>` is what `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs"` prints.
   - Otherwise, or after one failed direct search, dispatch `exo:research-worker` with `Sources: repo` and read only its `Read next` ranges plus direct callers or callees.
   - Upstream Decisions are settled.
2. **Gate.**
   - An open product decision goes to `spec` first, because the earliest stage wins.
   - With zero facts, edit directly, run the check, report and stop.
   - Otherwise draw `A → B` when edit B cannot land green before A. Two or more edges go to `spec`, unless a brief orders them.
   - A test-first request continues at any count, because the direct route has no red run.
3. **Workspace, then baseline.** Before the first edit, settle where the change commits, and wait for the answer when that asks.
   - For a multi-file change, confirm a clean working tree or name its pre-existing changed paths.
4. **Build.**
   - Report a required edit outside the oriented paths before touching it.
   - Edit in dependency order and ask nothing between files in scope.
   - Replace a hand edit repeated across many files with one script.
   - Keep every mutating edit idempotent, so retries land the same state.
   - When a hook reports the context budget crossed, write landed and open edits to `<scratch>/implement-next.md` at a green state and report that a clear comes next.
5. **Prove.**
   - For a risky change, read the test-design reference first.
   - *Done* needs a `Proof: <command or MCP tool> -> <output>` line from a real call this session made on input it did not write. Otherwise write `Unverified: <reason>` and do not claim Done.
   - A test runner is no proof, unless `package.json` names no `bin` and no `scripts.start`.
   - For a test-first bug, commit its failing test alone, because a test committed with its fix does not show it failed.
   - Otherwise exercise the feature, else run a test that failed before, else type check and build.
   - Run runners unpiped and without `cd &&`, which hide the failing command.
6. **Project knowledge.** Read the project-knowledge reference when proof reveals a missing command.
7. **Fresh eyes.** Read the fresh-eyes reference.
8. **Commit.** Commit where step 3 placed it, leaving out its pre-existing paths, then end on `ship`, unless the request rules out a push. In that case say nothing left the machine.
