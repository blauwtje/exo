---
name: author
description: "Creates, edits and shortens skills, agents and skill scripts. Use when the user asks to create, edit or shorten a skill, agent or skill script. Not for a rule or CLAUDE.md."
argument-hint: "skill or agent to create, edit or size"
model: opus
effort: medium
metadata:
  author: exo
  tags: skill, agent, script
---

# Author

## Purpose

Produce a skill or agent where every line changes what the model does.

## Prerequisites

`node`.

## Instructions

### Process

1. **Prove the need.** Change a skill, agent or check only for a user request or a failure seen in a real session. Grep the session transcripts for the failure, then write the failure down with its count before you edit, because an unrecorded failure cannot show later that the edit worked.
2. **Pick the home.** A check or test when a machine can tell right from wrong, a script when the steps never vary, a template when only the content varies, and prose last. Prose is the dearest home because it loads every time.
3. **Write it small.** Delete before you add: remove an overlapping rule before you write a new one. Read `references/instruction-style.md` before you word a rule, then run `node scripts/author-check.mjs --target <file>` for the lines, em dashes, CAPS words and frontmatter keys, and judge the prohibition count and one rule per sentence yourself.
4. **Run the check.** Run the brief's proof, else the project's static check. On a red check fix the structure; an exemption or allowlist entry only hides the failure. Then replay the recorded failure and show it no longer happens; skip the replay for a subjective change.

### Shape

- `npm run check` enforces the SKILL.md format; run it and fix what it names.
- `description` says what the skill does, then when to use it, in the third person. Add `Not for` only where two skills could both match; the check does not require it. Leave process steps out, because the model acts on the summary instead of reading the body.
- Material only some runs need goes to `references/<topic>.md`, named in the body with the condition for opening it.
- To use another skill, write "run `<plugin>:<name>`" and do not restate its rules.
- Text handed to a delegate goes under `references/` too, named in the step that hands it over.
- Open `references/anthropic-format.md` when you write or change a skill, agent, output style, hook or eval case, because it lists Anthropic's format rules that no check enforces.
- Frontmatter keys `argument-hint`, `model` and `effort` are not in the Agent Skills spec and break a claude.ai upload, so add them only to a skill that runs in Claude Code.

### Agents

- Frontmatter holds `name`, `description` (when the caller dispatches it), `model`, `effort` and a `tools` allowlist, the cheapest set that does the job.
- Plugin agents ignore `permissionMode`, `mcpServers`, `hooks` and `initialPrompt`, so leave them out.
- Run `claude --debug` once on a new agent, because an unknown key is ignored silently.

### Scripts

- Run as `node scripts/<name>.mjs`, with `--help`. Use Node built-ins only.
- Take input from flags, stdin or the environment, because a prompt hangs an unattended run. Print data to stdout and diagnostics to stderr.
- Take a constant from the repo, or use one overridable default.

### Judgment

- A rule a real failure showed outranks a rule that only reads well. For a description, write prompts that must fire the skill and near misses that must not, tune the edit on one half and keep it only when the held-out half gets no worse; log a dropped edit as "rejected: <what>, <why>" where the project logs its failures.

## Examples

Request: "shorten the learn skill".

```
1. Grep the transcripts for the failure and record its count.
2. Delete the overlapping rules.
3. Run npm run check and fix the structure it names.
```

## Limitations

- Delete a rule that changes no decision.

## Troubleshooting

| Error | Cause | Solution |
| --- | --- | --- |
| The static check is red | The skill's structure breaks a rule | Follow step 4. |
| An agent key has no effect | Plugin agents ignore an unknown key silently | Run `claude --debug` once on the new agent. |

## Available Scripts

| Script | Purpose | Arguments |
| --- | --- | --- |
| `author-check.mjs` | Prints the line, em dash and CAPS word counts and the frontmatter keys of a skill or agent file | `--target <file>` |
