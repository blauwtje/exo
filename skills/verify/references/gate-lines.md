# Gate output lines

Step 1 lines past `PASS`, `FAIL` and `STRAY`.

- Script runs each landed task's Proof, except the gate command or a test-suite run (`npm test`, `node --test`) under a default gate; one passed on this tree prints `SKIP`.
- `WARN` or `FIX-ONLY` line → list in the report; never ends the turn.
- `SESSION <check>` line names a skipped `mcp:<tool> <args>` call → call `mcp__<server>__<tool>` with those args, not through Bash.
  - Record `PASS <check>` or `FAIL <check> (<why>)` in gate output; that `FAIL` ends the turn.
  - No `mcp__*__<tool>` tool → record `UNRUN <check>`, not `PASS`; list it in the `REPORT` file.
