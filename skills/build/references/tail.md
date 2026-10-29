# The loop, step 7: the tail

7. **The tail.** End this loop on `gate`; its message follows the report rule in `${CLAUDE_PLUGIN_ROOT}/skills/route-skills/references/closing.md`, as `gate`'s `Report:` line sets.
   - A request to push nothing or open no pull request still runs `gate`, whose step 4 decides whether `ship` follows.
   - `--land` → run `verify --land`, so one reply carries the run through `ship`.
   - The `Proof:` lines and the brief's `## Manual checks` stay out of this turn's message: the `REPORT` file's `## Proofs` and `## Manual checks` hold them, however `gate` ends, a `FAIL` that ends its turn included.
   - The message names that file's path.
   - Never rerun a proof or read the plan, a test or a script to name one.
   - Their `Decisions:` line goes in the report as a path, unread; the branch reviewer reads that log.
   - Change line → run `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after build --artifact <plan>`; print its output above `ship`'s question, else as the last line.
