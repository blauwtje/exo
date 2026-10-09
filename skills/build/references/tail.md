# The loop, step 7: the tail

7. **The tail.** End this loop on `verify`, whose report is three state lines and one decision, and names the `REPORT` file.
   - A request to push nothing or open no pull request still runs `verify`, whose step 4 decides whether `ship` follows.
   - `--land` → run `verify --land`, so one reply carries the run through `ship`.
   - The `Proof:` lines and the brief's `## Manual checks` stay out of this turn's message: the `REPORT` file's `## Proofs` and `## Manual checks` hold them, however `verify` ends, a `FAIL` that ends its turn included.
   - The message names that file's path.
   - Never rerun a proof or read the plan, a test or a script to name one.
   - Their `Decisions:` line goes in the report as a path, unread; the branch reviewer reads that log.
