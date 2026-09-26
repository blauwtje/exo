---
name: remember
description: "Use when the user wants a correction about this repository kept, or asks what exo remembers here, what still holds, or to forget a line. Not for a plan another session runs, which define-scope owns, or a build or test command, which find-cause writes to AGENTS.md or CLAUDE.md."
argument-hint: "[the correction this session must not lose]"
allowed-tools: Bash(node *memory.mjs*)
disable-model-invocation: true
---

# Memory

Keep only what two sessions attested and the repository still supports. The enemy is the memory file that grows until every session pays to read a claim that stopped being true. The overcorrection is a file so guarded that a correction the user gave twice never reaches it.

## When to use

- The user corrects a repository fact this session got wrong and wants it kept.
- The user asks what exo remembers here, or asks it to forget something.
- Not for a plan another session runs: `define-scope` owns that.
- Not for a build, test or run command a reproduction revealed: `find-cause` step 6 appends that to `AGENTS.md` or `CLAUDE.md`, and two writers of project knowledge produce two truths.
- Not for what the repository already records: code structure, git history and `CLAUDE.md` are re-read faster than they are remembered.

## What is attested twice

The claims two separate sessions have already booked, waiting for approval:

!`node "${CLAUDE_SKILL_DIR}/scripts/memory.mjs" propose`

## The loop

1. **Reach for the stronger fix first.** Before booking, walk the ladder in `../edit-skills/references/where-a-fix-lives.md` and propose the strongest home the mistake fits, including a skill or instruction edit, instead of a claim; book only what is left: a fact none of those can carry.
2. **Book** the user's correction with `node "${CLAUDE_SKILL_DIR}/scripts/memory.mjs" book --claim "<one sentence>" --quote "<their words, verbatim>" --session "<this session id>"`. Quote no password, token or key: the quote is stored as given.
3. **Write nothing yet** when the block above names no claim, and say which session count the booking now stands at, because a claim one session misheard is the failure this gate exists for.
4. **Propose** each claim in the block above to the user with both dated quotes, in the question shape, and wait. Nothing is written before the answer.
5. **Write** an approved claim with `node "${CLAUDE_SKILL_DIR}/scripts/memory.mjs" write --claim "<the claim>" --refs "<path,path#symbol>"`, adding `--replaces "<the old claim>"` when it answers a question an earlier line already answered, so the file never holds two answers to one question.
6. **Relay a refusal** exactly as the script printed it, and retire a line the refusal names with `node "${CLAUDE_SKILL_DIR}/scripts/memory.mjs" retire --claim "<the claim>"` before trying again. Edit neither file by hand: memory.json is the state and memory.md is rendered from it, and a hand edit makes them disagree.
7. **Prune** with `node "${CLAUDE_SKILL_DIR}/scripts/memory.mjs" verify` whenever the user asks what is still true, and report every dropped line the script named.
8. **Report** the rendered path and its byte count against the budget, in one line.

## References

| File | Read it when |
|---|---|
| `../route-skills/references/question.md` | Before a message that asks the user to pick among numbered options. |
| `../edit-skills/references/where-a-fix-lives.md` | Before booking a correction, to check whether a stronger fix than a memory line exists. |

## Judgment

- The script's output outranks anything in this context, including a memory file read earlier in the session.
- A check, script, template or skill edit that would catch the mistake outranks a memory claim, because a claim is read, not enforced.
- Two attested sessions and the user's approval outrank a claim that reads true: a claim one session misheard is exactly what this gate refuses.
- A refusal is relayed and acted on, never worked around by editing a file directly.
- A claim the repository itself records is dropped rather than written, because reading it is cheaper than trusting it.
