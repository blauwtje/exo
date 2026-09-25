---
name: file-issues
description: Use when the user asks in plain words to file, open, write or split GitHub issues. Not for a brief define-scope stores, closing or editing an existing issue, a plan, or a repository the working directory does not point at.
argument-hint: <what the issue or issues should cover>
allowed-tools: Bash(gh issue *), Bash(gh label *), Bash(gh project *), Bash(gh pr list *), Bash(git log *), Bash(node *repo-fields.mjs*)
model: opus
effort: high
---

# File issues that read as specs

An issue states what must become true, so a later plan can be written against
it. The enemy is the story issue: the occasion that prompted it, a quote from
the prompt, and a background paragraph repeating the labels, type and parent
that GitHub already shows beside the body. The overcorrection is the one-line
issue that never says when it is done, which pushes the whole spec into the
plan. An issue is a spec before a plan; a plan reads it and never depends on
it staying open.

A plain request to file, open, write or split issues authorizes creating them,
with their labels, type, project fields, relations and milestone, and creating
the default labels `references/fields.md` names when the repository defines
none of its own. It never closes an issue, never deletes one, and never edits
an existing one, except to add a relation to a parent or a blocker the user
named.

## Steps

1. **Intake.** Turn the request into one goal sentence per issue, and say
   which sentence came from which part of the request. An issue whose goal
   sentence needs an "and" for two unrelated outcomes is too big: propose a
   parent plus sub-issues and ask once, listing the split you would make.
   That is the only question this skill asks, because the request approved
   the rest. Never invent an issue the request does not ask for.

2. **Read the repository, invent nothing.** Run
   `node "${CLAUDE_SKILL_DIR}/scripts/repo-fields.mjs"` and pick the vocabulary
   from its JSON, as `references/fields.md` says. Its `titles` carries the
   language of the last five issues; report each `unread` entry it names.

3. **Ground the references.** Send the `exo:locate-code` agent the paths and symbols the
   goal sentences name, so `References` carries real paths. Skip this step for
   an issue that names no code.

4. **Create in dependency order**, in the same turn and with no approval
   question first: a parent before its children, a blocker before what it
   blocks, with the commands and field settings in `references/fields.md`.

5. **Read back.** `gh issue view <n> --json number,title,labels,milestone,url`
   per created issue, and report each URL with its title and one metadata
   line, plus everything Step 2 said this repository does not define.

## The body

Write it in the language of the existing issues. When there are none, follow
the language of the recent pull requests and commits
(`gh pr list --limit 5 --json title --jq '[.[].title]'`,
`git log -5 --format=%s`). The skill's own text stays English.

Take the shape from `references/fields.md`: Spec for a brief or for feature
work, Report for a bug, a regression, a chore or a documentation fix. That
file holds both section lists, the ban on a background section and on
repeating the metadata, and how priority, size and estimate are read off the
body; no field and no section is decided here.

## References

| File | Read it when |
|---|---|
| `references/fields.md` | Steps 2 and 4, before reading the repository and before creating. |

## Judgment

- Explicit user instructions outrank this skill, including a body section it
  forbids: say once that the metadata already shows it, then write it.
- The repository's vocabulary outranks the request's wording: a label the
  user names that does not exist is reported, not created.
- A request to change or close an existing issue leaves this skill: report it
  and let the user run the `gh` command, except the parent or blocker
  relation the authorization above covers.
- Sizing belongs to the user. Propose a split once; a repeated request for one
  issue is the decision.
