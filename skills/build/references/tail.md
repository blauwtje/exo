# The loop, step 7: the tail

7. **The tail.** End this loop on `verify`, whose report ends with every task and the brief's `## Manual checks`.
   - A request to push nothing or open no pull request still runs `verify`, whose step 4 decides whether `ship` follows.
   - The report's `Proof:` lines are what `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --proofs --plan <plan> --root <checkout>` prints, copied, whether the loop ended on `Next: none` or at the request's last task.
   - Never rerun a proof or read the plan, a test or a script to name one.
   - Its `Decisions:` line goes in the report as a path, unread; the branch reviewer reads that log.
