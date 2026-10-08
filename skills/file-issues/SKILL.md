---
name: file-issues
description: Use when the user asks in plain words to file, open, write or split GitHub issues. Not for a brief spec stores, closing or editing an existing issue, a plan, or a repository the working directory does not point at.
argument-hint: <what the issue or issues should cover>
allowed-tools: Bash(gh issue *), Bash(gh label *), Bash(gh project *), Bash(gh pr list *), Bash(git log *), Bash(node *repo-fields.mjs*)
model: opus
effort: high
---

# File issues that read as specs

An issue states what must become true, so a later plan can be written against it. The enemy is the story issue: the occasion that prompted it, a quote from the prompt, and a background paragraph repeating the labels, type and parent GitHub already shows beside the body. The overcorrection is the one-line issue that never says when it is done, pushing the whole spec into the plan.

A plain request to file, open, write or split issues authorizes creating them, with labels, type, project fields, relations and milestone.

## Steps

1. **Intake.** One goal sentence per issue, each tied to the part of the request it came from.
   - Never invent an issue the request does not ask for.
   - Goal sentence needing "and" for two unrelated outcomes → too big: propose a parent plus sub-issues, list the split, ask once.

2. **Read the repository, invent nothing.** Run `node "${CLAUDE_SKILL_DIR}/scripts/repo-fields.mjs"`; pick the vocabulary from its JSON per `references/fields.md`.

3. **Ground the references.** Send `exo:locate-code` the paths and symbols the goal sentences name, so `References` carries real paths. Skip for an issue naming no code.

4. **Create in dependency order**, same turn, no approval question first: parent before children, blocker before what it blocks, with the commands and field settings in `references/fields.md`.
   - Run no `gh` command that closes, deletes or edits an existing issue, even at the user's request; the pre-approved `gh issue *` would run it unconfirmed. Give the user the command instead.
   - Exception: adding a relation to a parent or blocker the user named.

5. **Read back.** `gh issue view <n> --json number,title,labels,milestone,url` per created issue; report its URL, title and one metadata line.

## The body

- Language → that of the existing issues (the script's `titles`); none → that of recent pull requests and commits (`gh pr list --limit 5 --json title --jq '[.[].title]'`, `git log -5 --format=%s`).
- Brief or feature work → Spec shape in `references/fields.md`.
- Bug, regression, chore or documentation fix → Report shape:
  - `### What happens`: one sentence naming the current behavior, present tense.
  - `### Expected`: what should happen instead.
  - `### Steps`: the prompts or commands producing it, in order.
  - `### Environment`: versions and platform the repository's own bug template asks for, one per line.
  - `### Evidence`: relevant output, transcript or log lines only, secrets removed.

## References

| File | Read it when |
|---|---|
| `references/fields.md` | Steps 2 and 4, and before writing a Spec body. |

## Judgment

- Explicit user instructions on the body outrank this skill, including a section it forbids: say once that the metadata already shows it, then write it.
- Repeated request for one issue after a proposed split → that is the decision.
