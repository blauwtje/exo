# Shape of a hook

Hook text and code run on every matching event, so each earns its cost in tokens, time and false blocks.

## Registration

- Plugin hooks live in `hooks/hooks.json` under a top-level `"hooks"`: event, then matcher group, then handler. Handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.
- One hook process per event and matcher, not one per feature; matching hooks run in parallel and see no other hook's output, so a second feature on the same event joins the existing process.
- Each entry pins `"shell": "bash"`, else a Windows host without Git Bash falls back to PowerShell. Keep the command in shell form, not `args`, so the harness resolves the shell.
- Command path → starts with `${CLAUDE_PLUGIN_ROOT}`.
- Hook code stays Node with no `jq`; `.gitattributes` forces LF, because a CRLF shebang fails silently on Windows.
- Hook code size is locked by `verify/checks/hook-size.mjs` (`HOOK_LINES_LOCK` in `verify/budgets.mjs`): growth fails, and a raise is a hand edit in the commit that pays for it.

## Output

- Exit 0 → stdout is parsed as JSON; exit 2 → blocking, stderr is the reason; any other code is non-blocking.
- `hookSpecificOutput` needs `hookEventName`. Fields: `permissionDecision` (`allow`, `deny`, `ask` or `defer`), `updatedInput`, `additionalContext`.
- `PostToolUse` cannot block.
- `Stop` hook exiting 2 keeps the session going → check `stop_hook_active` first, else it loops.
- `SessionStart` text loads every session → inject pointers, not file contents.

## Timing and matching

- Default `timeout` is 600 s for a command, 30 s on `UserPromptSubmit`; `SessionEnd` shares 1.5 s. A `timeout` under 1 s counts as 1 s.
- `claude --debug` logs each hook's duration.
- `Read` matcher misses `cat` or `sed` through Bash → match the Bash call too when the rule must hold.
- Rewriting a command inside a pipeline → never; add a prefix and leave the command text as written.
