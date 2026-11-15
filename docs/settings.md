# Settings

## Settings

Run `/exo:configure` to see every setting with its value and layer, or to change one. The first layer that sets a value wins:

1. `.claude/exo.local.json`, this machine only.
2. `.claude/exo.json`, the repository, committed.
3. The plugin options in `/config`.
4. The default.

| Key | Values (default first) | Sets |
|---|---|---|
| `specs` | `docs`, `issues`, `both` | Where `spec` stores a brief: `docs/specs/`, a GitHub issue, or both. |
| `ship` | `ask`, `pr-merge`, `open-pr`, `push`, `local` | The finish route `ship` takes without asking; `ask` makes `ship` ask once, at the end of the work. No plan line carries the route. `pr-merge` opens the pull request in the run and merges it outside the run. |

Short replies come from `/output-style exo:adhd`, which keeps code, commands, paths, error text, numbers and every not, no, only and except whole. Only chat prose is shortened.

## Status line

Claude Code only. `/exo:configure` runs `node skills/configure/scripts/settings.mjs statusline`: it writes a launcher to `~/.claude/exo/statusline.mjs` (under `CLAUDE_CONFIG_DIR` when set) and prints a `statusLine` block for your `settings.json`, which exo never edits. The status line has two lines. Line 1 is where and who: a bold `exo` mark, the git branch (cut to 20 characters), the model with its effort. Line 2 is what is left: `ctx 120k/200k`, the tokens in context against the window Claude Code auto-compacts at (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`, else `autoCompactWindow` in your settings, capped at the model's window, else the model's window) (read from the payload Claude Code sends), then `5h 42%` and `7d 63%` with `resets in`. A part with no data drops. `NO_COLOR` turns the colors off. After an exo update, rerun `/exo:configure` for the status line. To remove it, delete the `statusLine` key.
