# Shape of a hook

Hook text and code run on every matching event, so each hook pays for itself in tokens, time and false blocks.

## Registration

- Plugin hooks live in `hooks/hooks.json` under a top-level `"hooks"`: event, then matcher group, then handler. Handler types are `command`, `http`, `mcp_tool`, `prompt` and `agent`.
- Run one hook process per event and matcher. Matching hooks run in parallel and see no other hook's output, so a second feature on the same event joins the existing process.
- Pin `"shell": "bash"` in each entry, because a Windows host without Git Bash falls back to PowerShell. Keep the command in shell form, not `args`, so the harness resolves the shell.
- Start each command path with `${CLAUDE_PLUGIN_ROOT}`.
- Write hook code in Node without `jq`. `.gitattributes` forces LF, because a CRLF shebang fails silently on Windows.
- `verify/checks/hook-budgets.mjs` locks hook code size (`HOOK_LINES_LOCK` in `verify/budgets.mjs`). Growth fails, and a raise is a hand edit in the commit that pays for it.
- `verify/checks/hook-budgets.mjs` locks spawn time (`HOOK_SPAWN_MS_LOCK`). It fails when the median of seven `dispatch-bash.mjs` spawns runs above it, so keep imports lazy and avoid reads on the hook path.

## Output

- Exit 0 parses stdout as JSON, exit 2 blocks with stderr as the reason, and any other code does not block.
- `hookSpecificOutput` needs `hookEventName`. Its fields are `permissionDecision` (`allow`, `deny`, `ask` or `defer`), `updatedInput` and `additionalContext`.
- `PostToolUse` cannot block.
- A `Stop` hook that exits 2 keeps the session going, so check `stop_hook_active` first or it loops.
- `SessionStart` text loads every session, so inject pointers instead of file contents.

## Timing and matching

- The default `timeout` is 600 s for a command and 30 s on `UserPromptSubmit`, and `SessionEnd` shares 1.5 s. A `timeout` under 1 s counts as 1 s.
- `claude --debug` logs each hook's duration.
- A `Read` matcher misses `cat` or `sed` through Bash, so match the Bash call too when the rule must hold.
- Add a prefix to a command inside a pipeline and leave its text as written, because a rewritten pipeline breaks the command.
