---
name: ideas
description: "Turns one question on any subject into a short list of novel, useful and well-reasoned ideas as a ranked report. Use when the user says 'give me ideas', 'what are my options' or 'how could I approach' a problem. Not for design options for a code change (exo:spec) or sourced research (exo:search)."
argument-hint: "<question>"
metadata:
  author: exo
  tags: [ideas, brainstorm, ideation]
---

# Ideas

## Purpose

Turn one question into a ranked top 3 of ideas with a score, a prior-art verdict, a reason each could fail and a first test, written as one report in a run folder. An idea counts as strong only when its total is at least 16 out of 20, its prior-art verdict is not `exists`, and it beats the best existing answer in both orders of a pairwise comparison.

## Prerequisites

The Agent tool. A run starts 4 helpers, every helper runs on sonnet, and a run uses a noticeable part of the subscription limit. The helpers write under `~/.ideas/`, outside the project, so a permission rule `Edit(~/.ideas/**)` lets them save their files. The prompts the helpers read are the three files in `references/`, named in the steps below.

## Instructions

Run the steps below in order for the question in `$ARGUMENTS`, else the question in the user's request in this conversation. When neither holds a question, ask the user for it once, then ask nothing more during the run.

### Setup

1. Make the run folder `$HOME/.ideas/<YYYY-MM-DD>-<slug>/`, where the slug is the question in ASCII, lowercase, words joined by `-`, at most 40 characters; when the folder exists add `-2` (then `-3`). Call its absolute path `RUN`.
2. Every helper is one fresh agent with the type, model and effort given for it. Its prompt is: `Read <prompt file> and follow it exactly. Fill the placeholders {run} = RUN, {question} = <the question, verbatim>`, plus the extra placeholders named for it. Start helpers of the same step in one message and check every launch result for an error.
3. A helper writes its files and replies with the path or, for the Judge, with text. Run files are append-only: never edit a file a helper wrote, and write no file yourself. Judge a helper's result from its reply alone, with no file checks. When a helper reports an error or no result, rerun that helper once. When it still fails, stop the run and tell the user which step failed.

### Step 1: Scout and Generate

Start three helpers in one message, side by side, because none needs another's file.

1. Scout: `exo:researcher`, prompt line `Sources: web` first, `${CLAUDE_SKILL_DIR}/references/scout.md`, model sonnet, effort medium. Writes existing.md: the goal, the constraints, what makes an idea good, what already exists and the best existing answer.
2. Generate A: `general-purpose`, `${CLAUDE_SKILL_DIR}/references/generate.md`, model sonnet, effort high, with {lenses} = `wide brainstorm` and `unrelated domain`, {ids} = `I1 to I3`, {file} = ideas-a.md.
3. Generate B: `general-purpose`, `${CLAUDE_SKILL_DIR}/references/generate.md`, model sonnet, effort high, with {lenses} = `invert assumptions` and `avoid the obvious`, {ids} = `I4 to I6`, {file} = ideas-b.md.

### Step 2: Judge

Start the Judge as soon as all three helpers have returned: `exo:researcher`, prompt line `Sources: web` first, `${CLAUDE_SKILL_DIR}/references/judge.md`, model sonnet, effort high. It screens the ideas, improves the near misses once, compares the promising ones with the best existing answer in both orders, ranks them, and writes judge.md only. It replies with text: the `Strong: <n> of <m>` line and the top 3, one line each.

The strong rule: an idea is strong only when its total is at least 16 out of 20, its verdict is not `exists`, and it beats the best existing answer in both orders.

### Reply

From the Judge's reply, give the top 3 (title, score, strong yes or no, one line each) and the path of judge.md. Read no file.

## Examples

Request: "ideas for getting more people to read our newsletter". The skill makes `~/.ideas/<YYYY-MM-DD>-ideas-for-getting-more-people-to-read-ou/`, runs the steps, and replies:

```
1. <title>, 17/20, strong yes: <one line>
2. <title>, 16/20, strong no: <one line>
3. <title>, 14/20, strong no: <one line>
Report: ~/.ideas/<YYYY-MM-DD>-<slug>/judge.md
```

## Limitations

- The run is fully automatic: it asks nothing after the question.
- Ideas rest on the helpers' knowledge and a web check for prior art, not on a sourced search; use /exo:search for sources.
- Run files are append-only, and a run folder is never reused: a second run of the same question gets `-2`.

## Troubleshooting

| Error | Cause | Solution |
| --- | --- | --- |
| A helper reports an error or no result | It failed to run or to write its file | See Setup step 3. |
| A helper still fails after the rerun | A core step failed | Stop the run and tell the user which step failed. |
