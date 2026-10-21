# prompt

Rewrites a rough prompt for Claude and shows it, then runs it only after you say yes.

## When it runs

Only when you type `/exo:prompt <rough prompt>`.

Not for running a prompt unseen. Type the prompt as it is for that.

## What you get

- It first reads only what the rewrite needs: a path, a test or build command, or a pattern file. It edits nothing and runs no tests.
- It asks no questions. An unclear point stays open, in your words. You can pick a reading in your reply, such as "yes, but only X".
- One fenced block with your prompt rewritten: thinking cues, shouting and filler gone, pasted text kept verbatim. From pasted chat, only the lines the task needs stay, word for word; other needed facts go in one line.
- Tags only when they help: `<background>`, `<pasted_content>`, `<instructions>`, `<success_criteria>` and `<output_format>`. A clear one-line prompt stays plain.
- It adds only what your kind of request needs and the code shows, never a guessed fact.
- It leaves out what your session already covers: a line your CLAUDE.md files, rules, memory or a repo check already state. A line of yours that only repeats one goes too; one that narrows or adds detail stays.
- A stop rule (5 rounds, or sooner when a round makes no progress), a link to the official repository or docs of an outside project, and a first step of turning a vague goal into concrete checks go in the block by default, not into suggestions.
- Under the block, at most three numbered items under `Before it runs:`, most material first, only for what you alone can supply and what could change the work: a spend cap, how big a change may be, a skill that rules itself out, or two readings that lead to different work. A choice has lettered options with the best marked, such as `1. Features: a) keep all (best) b) may change`. Usually there are none. A suggestion never repeats.
- Reply `ok` to run as is, or with answers such as `1a` or `2: 10 dollars`; only those items apply and the block is shown again.
- It tunes the block to the model your session runs.
- One fixed line asking for ok. A plain yes runs the block as written, as your request in this session, without `exo:spec`; "yes, but drop X" changes only X and shows it again. Running it on its own output, suggestions applied, gives the same block back.
- Ask for a prompt to use elsewhere, such as in a new session, and the block is that prompt, ready to copy. It never runs here, and nothing follows the block except the numbered items.

## Source

`skills/prompt/SKILL.md`.
