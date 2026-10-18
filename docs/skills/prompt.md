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
- It adds only what your kind of request needs and the code shows, never a guessed fact. An `Added:` line under the block lists each add and where it came from.
- It tunes the block to the model your session runs.
- One line asking for ok. A plain yes runs the block as written, as your request in this session, without `exo:spec`; "yes, but drop X" revises it and shows it again.
- Ask for a prompt to use elsewhere, such as in a new session, and the block is that prompt, ready to copy. It never runs here; the last line asks only for changes.

## Source

`skills/prompt/SKILL.md`.
