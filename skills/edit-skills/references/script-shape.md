# Shape of a skill script

A script in `scripts/` does a step the same way every time, so the model runs it instead of rewriting it.

## Interface

- Call it as `node scripts/<name>.mjs`. The skill says "Run `x`" when the model executes it and "See `x`" when the model reads it.
- Make `--help` the interface: pass `usage` to `parseFlags` in `lib/script-flags.mjs`, which prints it and exits.
- Take input from flags, stdin or the environment, because a prompt would hang an unattended run.
- Send data to stdout and diagnostics to stderr, and document the exit codes in the usage text.
- Bound the output. A long result goes to a file and the script prints its path.
- For destructive or batch work, add a `--dry-run` that prints the plan first, and make a rerun with the same input change nothing more.

## Body

- Solve the problem in the script: handle each error and name the cause and the fix in the message instead of a bare failure.
- Take a constant from the repo or manifest. Without one, use a single overridable default in run.json `defaults` or an `EXO_*_MS` variable through `environmentMs` in `lib/script-flags.mjs`.
- Use Node built-ins only, so nothing needs installing.
