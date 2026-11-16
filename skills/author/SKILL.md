---
name: author
description: "Creates, edits and shortens skills, agents and skill scripts. Use when the user asks to create, edit or shorten a skill, agent or skill script. Not for a rule or CLAUDE.md."
argument-hint: <skill or agent to create, edit or size>
model: opus
effort: medium
---

# Author

A skill earns its place only by stopping a mistake the model makes without it. Produce a skill or agent where every line changes what the model does and every judgment rule carries one short reason.

## Process

1. **Prove the need.** Change a skill, agent or check only for a user request or a failure seen in a real session. Grep the session transcripts for the failure, then write the failure down with its count before you edit, because an unrecorded failure cannot show later that the edit worked.
2. **Pick the home.** A check or test when a machine can tell right from wrong, a script when the steps never vary, a template when only the content varies, and prose last. Prose is the dearest home because it loads every time.
3. **Write it small.** Delete before you add: remove an overlapping rule before you write a new one. Cut what the model already does without being told. Give each rule one condition, one action and, where it sets the boundary, one clause of reason. Read `references/instruction-style.md` before you word a rule.
4. **Run the check.** Run the proof the brief names, or the project's static check when it names none. On a red check fix the structure; an exemption or allowlist entry only hides the failure.

## Shape

- `description` says what the skill does, then when to use it, in the third person and under 1,024 characters. The harness rejects angle brackets and line breaks. Add `Not for` only where two skills could both match. Leave process steps out, because the model acts on the summary instead of reading the body.
- `SKILL.md` stays under 500 lines and about 2,000 tokens.
- Material only some runs need goes to `references/<topic>.md`, named in the body with the condition for opening it. A reference sits one level deep and names no other `.md` file.
- A skill never names a path into another skill, or `skills/<other>/`. Say the one sentence you need, or write "run `<plugin>:<name>`".
- Text handed to a delegate sits beside `SKILL.md` as `<role>-prompt.md`.

## Agents

- Frontmatter holds `name`, `description` (when the caller dispatches it), `model`, `effort` and a `tools` allowlist, the cheapest set that does the job.
- Plugin agents ignore `permissionMode`, `mcpServers`, `hooks` and `initialPrompt`, so leave them out.
- Run `claude --debug` once on a new agent, because an unknown key is ignored silently.

## Scripts

- Run as `node scripts/<name>.mjs`, with `--help`. Use Node built-ins only.
- Take input from flags, stdin or the environment, because a prompt hangs an unattended run. Print data to stdout and diagnostics to stderr.
- Take a constant from the repo, or use one overridable default.

## Judgment

- A rule a real failure showed outranks a rule that only reads well.
- Cut a rule only when the request names it, and keep each judgment rule's reason clause.
