# ideas

Turns one question on any subject into a ranked top 3 of novel, useful ideas by running a fixed ideation playbook as fresh helper agents.

Warning: a run starts 4 helpers and uses a noticeable part of the subscription limit.

## When it runs

On request: type `/exo:ideas` with your question. Claude does not start it by itself. It asks for the question once when you give none, then nothing more.

Not for design options for a code change (`exo:spec`) or sourced research (`exo:search`).

## What you get

- A run folder `~/.ideas/<YYYY-MM-DD>-<slug>/` that keeps every helper's file; run files are never edited. The helpers write under `~/.ideas/`, outside the project, so a permission rule `Edit(~/.ideas/**)` lets them save their files.
- A scout and two generators run side by side: the scout writes what already exists and the best existing answer, each generator writes 3 ideas through two lenses. Then one judge screens the 6 ideas, checks the prior art of the promising ones, rewrites the near misses once, scores each out of 20 and compares the best with the best existing answer in both orders.
- An idea is strong when its total is at least 16 out of 20, its prior-art verdict is not `exists`, and it beats the best existing answer in both orders.
- There is no extra round: one pass, 4 helpers.
- judge.md is the report: the top 3 (score, prior-art verdict, why it could fail, first test), a table of all ideas and the details per idea.
- The reply lists the top 3 in one line each and the path to judge.md. Everything is written in the language of the question.

## Source

skills/ideas/SKILL.md and its prompts in `skills/ideas/references/`.
