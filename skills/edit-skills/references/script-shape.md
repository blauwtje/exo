# Shape of a skill script

A script in `scripts/` does a step the same way every time, so the model runs it instead of rewriting it.

## Interface

- Called as `node scripts/<name>.mjs`; the skill says "Run `x`" when the model executes it and "See `x`" when it reads it.
- `--help` is the interface → pass `usage` to `parseFlags` in `lib/script-flags.mjs`, which prints it and exits.
- Never prompt: input comes from flags, stdin or the environment.
- Stdout carries data, stderr carries diagnostics; exit codes are documented in the usage text.
- Output is bounded; a long result goes to a file and the script prints its path.
- Destructive or batch work → a `--dry-run` that prints the plan first; a rerun with the same input changes nothing more.

## Body

- Solve in the script: handle each error and name the cause and the fix in the message, not a bare failure.
- Constant with no stated reason → none; take it from the repo or manifest, else one overridable default in run.json `defaults` or an `EXO_*_MS` variable through `environmentMs` in `lib/script-flags.mjs`.
- Node built-ins only → nothing to install.
