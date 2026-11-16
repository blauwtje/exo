# learn

Turns a correction you give again into a check that fails when the mistake returns, else one small lesson note, and offers lessons mined from past sessions as a numbered list.

## When it runs

A hook runs on every prompt you send and calls no model. When your prompt repeats one from an earlier session, it adds one `exo:` line, once per cluster, in any language. `learn` then judges whether the prompt is a correction or wish; when it is neither, it says nothing. On the first prompt of a session it adds a line when 2 or more past sessions hold the same correction.

You can also say that you corrected this before, or "remember this", or ask to mine past sessions or prune CLAUDE.md.

Not for a first correction mid-task, unfinished work (`save`) or a bug (`diagnose`).

## What you get

- Capture: a check the project already runs, written at once, shown failing on the old behavior and quoted with how to undo it.
- Mine: the script ranks clusters by sessions and gives each an id, `learn` judges which are worth a lesson and lists at most 5 with dates. Answer with numbers such as `1 3`; those are kept, every other listed one is rejected and never offered again, and clusters not listed stay open.
- State: under `~/.claude/exo/learn/` a cache file per project holds, per past prompt, only an id, date, session and hashed words, never prompt text, and is rebuilt from your session transcripts when missing. A second `.verdicts.jsonl` file holds only your keep and reject decisions and is never discarded.
- Notes: a lesson that cannot be a check becomes one note of at most 12 lines in Claude Code's auto-memory shape (name, description, type; the rule; Why; How to apply) under `.claude/lessons/` (project) or `~/.claude/lessons/` (personal), with an index line; a personal store sits beside the file your personal CLAUDE.md imports, so profiles share it. A store holds at most 15 notes, so a new one merges with or replaces an old one. CLAUDE.md holds one line that imports the index, so the model sees the descriptions.
- Prune: each CLAUDE.md line marked keep, update or delete against the current tree; lessons found there move to a check or note.

## Source

`skills/learn/SKILL.md`, `skills/learn/scripts/corrections.mjs`, `skills/learn/scripts/lessons.mjs`, `skills/learn/scripts/sessions.mjs`, `hooks/hooks.json`.
