# prompt

Rewrites a rough prompt for Claude and shows it, then runs it only after you say yes.

## When it runs

Only when you type `/exo:prompt <rough prompt>`.

Not for running a prompt unseen. Type the prompt as it is for that.

## What you get

- It first reads only what the rewrite needs: a path, a test or build command, or a pattern file. It edits nothing and runs no tests.
- It asks no questions. An unclear point stays open, in your words, and `exo:spec` settles it after your ok, if needed.
- One fenced block with your prompt rewritten: thinking cues, shouting and filler gone, pasted text kept verbatim.
- Tags only when they help: `<background>`, `<pasted_content>`, `<instructions>`, `<success_criteria>` and `<output_format>`. A clear one-line prompt stays plain.
- It adds only what your kind of request needs and the code shows, never a guessed fact. An `Added:` line under the block lists each add and where it came from.
- It tunes the block to the model your session runs.
- One line asking for ok. A plain yes runs the block as your request in this session; "yes, but drop X" revises it and shows it again.

## Source

`skills/prompt/SKILL.md`.
