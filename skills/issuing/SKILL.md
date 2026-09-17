---
name: issuing
description: Write and create GitHub issues for this repository as specs, with the labels, type, relations, milestone and project fields the repository actually defines. Use when the user asks to file, open, write or split issues. Not for closing or editing an existing issue, for a plan, or for issues in a repository the working directory does not point at.
argument-hint: <what the issue or issues should cover>
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *)
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

Invoking this skill authorizes creating the issues it showed you and you
approved, with their labels, type, project fields, relations and milestone,
and creating the default labels `references/fields.md` names when the
repository defines none of its own. It never closes an issue, never deletes
one, and never edits an existing one, except to add a relation to a parent or
a blocker you named.

## Steps

1. **Intake.** Turn the request into one goal sentence per issue, and say
   which sentence came from which part of the request. An issue whose goal
   sentence needs an "and" for two unrelated outcomes is too big: propose a
   parent plus sub-issues and ask once, listing the split you would make.
   Never invent an issue the request does not ask for.

2. **Read the repository, invent nothing.** Read its labels, issue types,
   milestones, project fields and issue templates, and pick the vocabulary,
   as `references/fields.md` says. Read the language of the last five issues
   with `gh issue list --limit 5 --json title,body --jq '[.[].title]'`.

3. **Ground the references.** Send the `exo:explorer` agent the paths and symbols the
   goal sentences name, so `References` carries real paths. Skip this step for
   an issue that names no code.

4. **Show the draft, then ask once.** Print, per issue: the title, the body,
   and one metadata line holding labels, type, parent, blocked-by, milestone
   and project fields. Ask one approval question covering all of them.
   Create nothing before the yes.

5. **Create in dependency order.** A parent before its children, a blocker
   before what it blocks, with the commands and field settings in
   `references/fields.md`.

6. **Read back.** `gh issue view <n> --json number,title,labels,milestone,url`
   per created issue, and report the URLs, plus everything Step 2 said this
   repository does not define.

## The body

Write it in the language of the existing issues. When there are none, follow
the language of the recent pull requests and commits
(`gh pr list --limit 5 --json title --jq '[.[].title]'`,
`git log -5 --format=%s`). The skill's own text stays English.

- One sentence naming the outcome, in the present tense, first line.
- `Done when`: checkable criteria as a task list, each one a state a reader
  can verify without reading the diff.
- `Out of scope`: what a reader would otherwise assume is included.
- `References`: the paths and symbols from Step 3, one per line.
- `Decided`: optional, only for a constraint the user settled that the
  criteria do not already carry.

Never write a background or motivation section, never quote the prompt, and
never repeat in the body what the metadata already shows: labels, type,
parent, blocked-by and milestone appear beside the issue, and a second copy
in the body goes stale on the first edit.

Size, effort and priority are the repository's own project fields or labels,
or the default labels in `references/fields.md` when it has none; never prose
in the body.

## References

| File | Read it when |
|---|---|
| `references/fields.md` | Steps 2 and 5, before reading the repository and before creating. |

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
