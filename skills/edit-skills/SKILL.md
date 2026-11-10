---
name: edit-skills
description: Use when the user asks to create, edit or size a skill, agent, hook or skill script. Not for a rule or CLAUDE.md; read references/instruction-style.md.
context: fork
agent: exo:orchestrator
argument-hint: <skill or agent to create, edit or size>
---

# Skills tool

A skill earns its place only by stopping a mistake the model makes without it, in the fewest words that takes. Produce a skill whose every line changes what the model does, with each rule carrying its boundary reason. Avoid restating default behavior, hiding the one rule that changes anything, and an order stripped of its boundary reason.

## When to use

- Use it when creating, changing or sizing a skill, agent, hook or skill script.
- When a stage (a plan step that calls this skill) borrows it, hand control back once the edit is done. Otherwise it owns the turn.
- Skip it for a one-time fix, one project's habit, or a limit a regex can check. A commit, `CLAUDE.md` or the verifier holds those, and a skill is for a call that needs judgment.

## The loop

1. **Catch the mistake.** Write one prompt per `references/pressure-scenarios.md` whose answer shows the mistake as one observable symptom.
2. **Watch it happen.** Read `benchmarks/results/` and any earlier `pressure.mjs` answers directory for the case first, because a stored result that covers the edited file and was made after its last edit stands in for the run. When the user asks for a run, or none covers the file, run `scripts/pressure.mjs --prompt <file> --cells <cells> --plugin-dir <clone>` on the cells `--cells-for <edited file>` prints, else the session's own, and read only the `without` answers now.
3. **Choose the home.** Change only what the request names. Place the fix per `references/where-a-fix-lives.md` and write prose in the shape below, with style per `references/instruction-style.md` and register per `references/wording.md`.
4. **Watch it stop.** Rerun `pressure.mjs` on the same cells only under step 2's condition (the user asks, or no stored result covers the file), and read the `with` answers. Rerun with `--full` on the verdict `INCONCLUSIVE` from `--grade`, and with `--contrast-env` when one setting alone is in question; when the `without` run also passed, harden it until it fails, in at most 3 rounds, then report.
5. **Close each new excuse.** Apply `references/plugging-holes.md` to each justification the `with` run still produced, then rerun all cases. You are done when a full rerun adds nothing to its tables.
6. **Verify.** Run the check the caller's rules (its brief's `Checks:`) assign to this edit, and only the proof it names when the caller reserves the full check to its lead. On a red check, fix the structure and add no exemption, lock or allowlist entry, which only hides the failure.
7. **Judge blind.** When step 4's read was a close call, judge the stored pre-edit and edited `with` answers blind per `references/blind-eval.md`, and run its clones only when the user asks.
8. **Name the evidence.** Commit a skill or agent wording change with an `Evidence: benchmarks/results/<file>` or `Evidence: none (<reason>)` trailer, because `npm run check` fails the branch without one; write the message file in an earlier call and run `git commit -F <file>`, or pass `-m`.

## The shape

| Part | Contract |
|---|---|
| `description` | Trigger only: moments it fires, then what it leaves alone. No workflow: the model acts on that summary instead of the body. |
| Opening | One paragraph: principle, a "Produce ..." sentence, an "Avoid ..." sentence with a concrete list. An overcorrection sentence only as an optional limit once a recorded run shows over-application. |
| `## When to use` | Bullets that name the symptoms first, then each "not for" case. |
| Process | Steps where order matters: numbered, aim at most eight, in order until one matches; a judgment skill with no fixed order: bullets. Each step a rule, with its reason in one clause. |
| `## Red flags` | Only in a skill the model is tempted to skip: table from tempting thought to what is true. |
| `## References` | Table of each file and when to read it; nothing loads before the step that needs it. |
| `## Judgment` | Ladder: which rule wins when two conflict. |

## Form

- Move bulk material (a template, a worked example, a checklist over 20 lines) to `references/`, and let the body name when to open it.
- Aim the body at 2,000 tokens (bytes after the frontmatter / 4) and the description at 200 characters; the verifier fails 2,500 tokens and 250 characters.
- A reference holds one topic and links to no other reference; over 100 lines it opens with a contents list linking each section.
- Put text handed to a delegate beside `SKILL.md` as `<role>-prompt.md`, with a References row naming the dispatching step. A **delegate** is a separate agent the skill starts; `references/` holds only what the skill reads itself.

## Red flags

| The excuse | What holds |
|---|---|
| "The body has room to explain itself." | A reason gets one clause, and a paragraph-long one moves to a reference. |
| "An edit this small needs no test run." | Without the `without` run, the edit is a guess about what the model does. |
| "Any model already knows this." | Then cut the line, because only what the `without` run got wrong earns a place. |
| "I will test them together once all the skills are written." | Each skill clears every case before the next begins, because skills written in a batch hide each other's gaps. |

## References

| File | Read it when |
|---|---|
| `scripts/rename-skill.mjs` | Renaming a skill: `node scripts/rename-skill.mjs --from <old> --to <new>` moves its folder, docs page and pressure folder and rewrites every mention in one pass. |
| `references/pressure-scenarios.md` | Step 1. |
| `references/where-a-fix-lives.md` | Step 3, before the first rule is written. |
| `references/instruction-style.md` | Step 3, before writing or editing any instruction file such as `CLAUDE.md`, a rule or an output style. |
| `references/wording.md` | Step 3, when two phrasings compete or a rule's tone is unclear. |
| `references/description.md` | Step 3 for the frontmatter; step 5 when a symptom joins the description. |
| `references/prompt-rules.md` | Step 3, when writing a skill or agent body, a delegate prompt or a brief. |
| `references/skill-shape.md` | Step 3 for a skill started from nothing, and not for a change to an existing skill. |
| `references/agent-shape.md` | Step 3 for an agent started from nothing. |
| `references/hook-shape.md` | Step 3 for a hook started from nothing. |
| `references/script-shape.md` | Step 3 for a skill script started from nothing. |
| `../../docs/principles/README.md` | Step 3, when the edit designs a prompt, context, agent, tool, harness or eval. |
| `references/plugging-holes.md` | Step 5, once a run with the skill loaded still produced a justification. |
| `references/blind-eval.md` | Step 7, when step 4's `with`/`without` read is a close call. |
| `../../lib/references/closing.md` | Before the final message. |

## Judgment

- A rule the `without` run broke outranks a rule that only reads well.
- Revert an edit that has neither a run nor a stored result made after its last edit and covering its file, and do not keep it as a draft.
- Cut a rule only when the request names it, and keep every rule's reason clause.
