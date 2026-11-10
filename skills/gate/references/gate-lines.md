# Gate output lines

This page explains the gate output lines that step 1 meets beyond `PASS`, `FAIL` and `UNPLANNED`, so each one gets the right handling.

- The script runs each landed task's Proof, except the gate command or a test-suite run (`npm test`, `node --test`) under a default gate. A Proof that already passed on this tree prints `SKIP`.
- A `SKIP … passed on this same tree` line is a cached pass from `lib/check-cache.mjs` for this exact tree. Accept it, and do not rerun it or read `gate.mjs`.
- The gate runs once, with the `Success criterion`'s first backticked command, else its `Land gate:`, else `npm run check`, else `npm test`.
- A `FLAKY Task <n> (passed on retry: <files>)` line means a failing test file of a `node --test` Proof passed on one rerun. It ends no turn, the count goes in `.exo/flaky.json`, and the report lists the file.
- A `WARN`, `FIX-ONLY` or `DOCS <path>` line (a plan doc or changelog outside every `Files:`) goes in the report and does not end the turn.
- A `SELF-HOSTED` line goes in the report.
- Report `UNPLANNED` as "file outside the plan" and a concern as "unproven risk", each with what exo did.
- A `SESSION <check>` line names a skipped `mcp:<tool> <args>` call. Call `mcp__<server>__<tool>` with those args, and do not go through Bash.
  - Record `PASS <check>` or `FAIL <check> (<why>)` in the gate output. That `FAIL` ends the turn.
  - When no `mcp__*__<tool>` tool exists, record `UNRUN <check>` instead of `PASS`, and list it in the `REPORT` file.
- A `benchmark` line compares the newest `*-sweep.md` results file with the plan's `Baseline: <file> @ <commit>`. `FAIL benchmark (regression|unmeasured: …)` ends the turn; `WARN benchmark override (<reason>)` goes in the report, and `WARN benchmark override ignored (added after the run started)` means the line was not in the plan at its spec commit.
