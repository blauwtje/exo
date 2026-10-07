# The loop, step 7: the tail

7. **The tail.** End this loop on `verify`, whose report ends with every task and the brief's `## Manual checks`.
   - A request to push nothing or open no pull request still runs `verify`, whose step 4 decides whether `ship` follows.
   - This turn's report carries the `Proof:` lines however `verify` ends, a `FAIL` that ends its turn included.
   - They are the `Proof:` lines step 3's last `--block` printed, copied, whether the loop ended on `Next: none` or at the request's last task.
   - On the inline route, which reruns no `--block` after landing, run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/next-task.mjs" --proofs --plan <plan> --root <checkout>` before `verify` and copy its lines.
   - Never rerun a proof or read the plan, a test or a script to name one.
   - Their `Decisions:` line goes in the report as a path, unread; the branch reviewer reads that log.
