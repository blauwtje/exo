# Settings

## Settings

Set these in `/config` under the exo plugin. An unset setting takes its default.

| Key | Values (default first) | Sets |
|---|---|---|
| `specs` | `docs`, `issues`, `both` | Where `spec` stores a brief: `docs/specs/`, a GitHub issue, or both. |
| `ship` | `ask`, `pr-merge`, `open-pr`, `push`, `local` | The finish route `ship` takes without asking; `ask` makes `ship` ask once, at the end of the work. No plan line carries the route. `pr-merge` opens the pull request in the run and merges it outside the run. |

Short replies come from `/output-style exo:adhd`, which keeps code, commands, paths, error text, numbers and every not, no, only and except whole. Only chat prose is shortened.

## Model and advisor

exo's skills and agents run on Sonnet or Haiku by default, and some steps, such as a second attempt or a long brief, run Opus; a stronger model runs only when exo's routing table, a plan's `Model:` line or you pick it. Pick Fable yourself with `/model fable` for your hardest and longest-running tasks; Fable usage can bill to usage credits.

The advisor lets the session's model consult a stronger one. Turn it on in one of three ways: run `/advisor opus` in a session, set `"advisorModel": "opus"` in your `settings.json`, or start one session with `claude --advisor opus`; the value is `fable`, `opus`, `sonnet` or a full model ID. Subagents, exo's builder and researcher included, inherit the advisor when their own model passes the pairing check. A Sonnet main model accepts an Opus advisor, and a Fable 5.2 main model accepts only a Fable 5.2 advisor.

## Status line

Claude Code only. Run this in a terminal:

```sh
node "$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/exo/*/ | sort -V | tail -n 1)lib/statusline-install.mjs"
```

It writes a launcher to `~/.claude/exo/statusline.mjs` (under `CLAUDE_CONFIG_DIR` when set) and prints a `statusLine` block for your `settings.json`, which exo never edits. The status line has two lines. Line 1 is where and who: a bold `exo` mark, the git branch (cut to 20 characters), the model with its effort. Line 2 is what is left: `ctx 120k/200k`, the tokens in context against the window Claude Code auto-compacts at (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`, else `autoCompactWindow` in your settings, capped at the model's window, else the model's window) (read from the payload Claude Code sends), then `5h 42%` and `7d 63%` with `resets in`. A part with no data drops. `NO_COLOR` turns the colors off. After an exo update, rerun that command. To remove it, delete the `statusLine` key.
