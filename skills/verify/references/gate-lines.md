# Gate output lines

Step 1 lines past `PASS`, `FAIL` and `STRAY`.

- Script runs each landed task's Proof, except the gate command or a test-suite run (`npm test`, `node --test`) under a default gate; one passed on this tree prints `SKIP`.
- `SKIP … passed on this same tree` → a cached pass from `lib/check-cache.mjs` for this exact tree; accept it, do not rerun it or read `verify.mjs`.
- The gate runs once: the `Success criterion`'s first backticked command, else its `Land gate:`, else `npm run check`, else `npm test`.
- `WARN` or `FIX-ONLY` line → list in the report; never ends the turn.
- `DOCS <path>` line → a plan doc or the changelog outside every `Files:`; ends no turn; list it in the report as a plan doc.
- Report `STRAY` as "file outside the plan" and a hazard as "unproven risk", each with what exo did.
- `SESSION <check>` line names a skipped `mcp:<tool> <args>` call → call `mcp__<server>__<tool>` with those args, not through Bash.
  - Record `PASS <check>` or `FAIL <check> (<why>)` in gate output; that `FAIL` ends the turn.
  - No `mcp__*__<tool>` tool → record `UNRUN <check>`, not `PASS`; list it in the `REPORT` file.
