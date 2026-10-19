---
name: edit-skills
description: Use when creating, editing or sizing a skill or agent, and before it is done. Not for a rule or CLAUDE.md; read references/instruction-style.md.
disable-model-invocation: true
argument-hint: <skill or agent to create, edit or size>
---

# Skills tool

A skill earns its place only by stopping a mistake the model makes without it, in the fewest words that takes. Produce a skill whose every line changes what the model does, each rule carrying its boundary reason. Avoid restating default behavior, hiding the one rule that changes anything, and an order stripped of its boundary reason.

## When to use

- Creating, changing or sizing a skill or agent.
- Borrowed by a stage → hand control back once done; otherwise own the turn.
- Not for a one-time fix, one project's habit, or a limit a regex can check: a commit, `CLAUDE.md` or the verifier holds those; a skill is for a call needing judgment.

## The loop

1. **Catch the mistake.** Write one prompt per `references/pressure-scenarios.md` whose answer shows the mistake as one observable symptom.
2. **Watch it happen.** Read `benchmarks/results/` and any earlier `pressure.mjs` answers directory for the case first; a stored result covering the edited file, made after its last edit, stands in for the run. The user asks for a run, or none covers the file → run `scripts/pressure.mjs --prompt <file> --cells <cells> --plugin-dir <clone>` on the cells `--cells-for <edited file>` prints, else the session's own; read only the `without` answers now.
3. **Choose the home.** Place the fix per `references/where-a-fix-lives.md`; write prose in the shape below, style per `references/instruction-style.md`, register per `references/wording.md`.
4. **Watch it stop.** Rerun `pressure.mjs` on the same cells only under step 2's condition (the user asks, or no stored result covers the file); read the `with` answers. `without` run also passed → case shows nothing; harden it until that run fails.
5. **Close each new excuse.** Each justification the `with` run still produced → apply `references/plugging-holes.md`, rerun all cases. Done when a full rerun adds nothing to its tables.
6. **Verify.** Run the check the caller's rules assign to this edit (a caller that reserves the full check to its lead → only the proof it names). Red check → fix the structure; never add an exemption, lock or allowlist entry to turn it green.
7. **Judge blind.** Step 4's read a close call → judge stored pre-edit and edited `with` answers blind, per `references/blind-eval.md`; run its clones only when the user asks.
8. **Name the evidence.** Commit a skill or agent wording change with an `Evidence: benchmarks/results/<file>` or `Evidence: none (<reason>)` trailer; `npm run check` fails the branch without one.

## The shape

| Part | Contract |
|---|---|
| `description` | Trigger only: moments it fires, then what it leaves alone. No workflow: the model acts on that summary instead of the body. |
| Opening | One paragraph: principle, a "Produce ..." sentence, an "Avoid ..." sentence with a concrete list. An overcorrection sentence only as an optional limit once a recorded run shows over-application. An existing enemy/overcorrection opening migrates when that skill is next edited. |
| `## When to use` | Bullets: symptoms first, then each "not for" case. |
| Process | Steps where order matters: numbered, aim at most eight, in order until one matches; a judgment skill with no fixed order: bullets. Each step a rule, with its reason in one clause. |
| `## Red flags` | Only in a skill the model is tempted to skip: table from tempting thought to what is true. |
| `## References` | Table of each file and when to read it; nothing loads before the step that needs it. |
| `## Judgment` | Ladder: which rule wins when two conflict. |

## Form

- Bulk material (template, worked example, checklist over 20 lines) → `references/`; body names when to open it.
- Aim the body at 2,000 tokens (bytes after the frontmatter / 4) and the description at 200 characters; the verifier fails 2,500 tokens and 250 characters.
- A reference holds one topic and links to no other reference; over 100 lines it opens with a contents list linking each section.
- Text handed to a delegate → beside `SKILL.md` as `<role>-prompt.md`, with a References row naming the dispatching step; `references/` holds only what the skill reads itself.

## Red flags

| The excuse | What holds |
|---|---|
| "The body has room to explain itself." | Reason gets one clause; a paragraph-long one → reference. |
| "An edit this small needs no test run." | Without the `without` run, the edit is a guess about what the model does. |
| "Any model already knows this." | Then cut the line; only what the `without` run got wrong earns a place. |
| "I will test them together once all the skills are written." | Each skill clears every case before the next begins; skills written in a batch hide each other's gaps. |

## References

| File | Read it when |
|---|---|
| `scripts/rename-skill.mjs` | Renaming a skill: `node scripts/rename-skill.mjs --from <old> --to <new>` moves its folder, docs page and pressure folder and rewrites every mention in one pass. |
| `references/pressure-scenarios.md` | Step 1. |
| `references/where-a-fix-lives.md` | Step 3, before the first rule is written. |
| `references/instruction-style.md` | Step 3, before writing or editing any instruction file, `CLAUDE.md`, rule, agent, output style or hook included. |
| `references/wording.md` | Step 3, when two phrasings compete or a rule's tone is unclear. |
| `references/description.md` | Step 3 for the frontmatter; step 5 when a symptom joins the description. |
| `references/skill-shape.md` | Step 3 for a skill started from nothing; never for a change to an existing skill. |
| `references/plugging-holes.md` | Step 5, once a run with the skill loaded still produced a justification. |
| `references/blind-eval.md` | Step 7, when step 4's `with`/`without` read is a close call. |

## Judgment

- Rule the `without` run broke outranks a rule that only reads well.
- Edit with neither a run nor a stored result made after its last edit covering its file → revert, never keep as draft.
- Overlong skill → drop its weakest rule, never a rule's reason clause.
