# learn

Turns a correction you give again into a check that fails when the mistake returns, else one small lesson note, and offers lessons mined from past sessions as a numbered list.

## When it runs

A hook runs on every prompt you send and calls no model. When your prompt repeats ones from at least 2 other sessions, it adds one `exo:` line, once per cluster, in any language. `learn` then judges whether the prompt is a correction or wish; when it is neither, it says nothing. When your prompt repeats a lesson you kept, the line says the prompt shares words with that lesson, once per keep, and `learn` judges whether the lesson failed before it makes it stronger. At session start (startup, resume and clear) it adds a line when 3 or more past sessions hold the same correction. The hook flags nothing until a project holds about 40 recorded prompts, because a counted word must sit in 2 or more entries and in no more than 5% of them.

At the old threshold of 2 sessions, on 626 past sessions the hook raised 90 flags. Two judges called 38 and 37 of them a lesson and agreed on 85 of the 88 flags both labelled (kappa 0.945). How many repeats the hook misses is not measured.

You can also say that you corrected this before, or "remember this", or ask to mine past sessions or prune CLAUDE.md.

Not for a first correction mid-task, unfinished work (`save`) or a bug (`diagnose`).

## What you get

- Capture: a check the project already runs, written at once, run on the line or diff from the session where the user gave the correction, else on a copy of that mistake and quoted with how to undo it.
- Mine: the script ranks clusters by sessions and gives each an id, `learn` judges which are worth a lesson and lists every one in a single numbered list with dates, and says unpicked items are dropped. One reply settles it: `1 3` keeps 1 and 3 and rejects the other shown items (only when the reply is just numbers, `all` or `none`; any other reply keeps what is clearly picked and leaves the rest open), `all` keeps all, `none` rejects all, `later` leaves all open. Kept items are written one after another and the turn ends on one line per lesson. A rejected cluster, or one `learn` judged not a lesson and names in one line, is never offered again.
- State: under `~/.claude/exo/learn/` a cache file per project root holds, per past prompt, only an id, date, session and hashed words (sha1, no key), so no prompt text and no word order is stored, but a word list can match single words; the folder is `0700` and each file `0600`, so only you can read them; the cache is rebuilt from your session transcripts when missing. A second `.verdicts.jsonl` file holds only your keep and reject decisions and is never discarded.
- Notes: a lesson that cannot be a check becomes one note of at most 12 lines in Claude Code's auto-memory shape (name, description, type; the rule; Why; How to apply) under `.claude/lessons/` (project) or a `lessons/` folder beside the personal `rules` folder, with an index line. The index is `<project>/.claude/rules/lessons.md` (project) or `<config>/rules/lessons.md` (personal), which Claude Code loads by itself, so CLAUDE.md holds no line for it; an old import line is moved by itself and quoted with how to undo it. A lesson that names files becomes a path rule under `rules/lessons/` that loads with the matching file. A store holds at most 15 notes, so a new one merges with or replaces an old one.
- Strengthen: when a kept lesson repeats, `learn` moves it up in this order: a check, a path rule, else a reworded note with the rule first and one line showing the mistake, and it reports why each higher step did not fit.
- Auto memory: `learn` reads the project's auto-memory index first; a personal lesson it already holds is updated there, and a project lesson is still written in the project store.
- Skill edit: a lesson about how a skill or agent works becomes an edit to that skill or agent when its file sits in the project or your config folder; for a plugin's skill, `learn` names the skill and writes a note. A lesson that would not hold for a different task is not written.
- Prune: each CLAUDE.md line marked keep, update or delete against the current tree; lessons found there move to a check or note. It also marks delete each lesson note a check now enforces or the tree makes impossible, and points to `/doctor prompt-audit` for stale references and contradictions in CLAUDE.md, rules and skills. It waits for your yes.

## Source

`skills/learn/SKILL.md`, `skills/learn/scripts/corrections.mjs`, `skills/learn/scripts/lessons.mjs`, `skills/learn/scripts/sessions.mjs`, `hooks/hooks.json`.
