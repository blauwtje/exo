---
name: spec
description: "Shapes a request into a brief: the decisions only the user can make, then a plan of tasks that each carry a proof command. Use when the user asks to plan or spec a change ('plan this', 'write a spec'), when a request leaves done, data, architecture or a trade-off open, or the user asks for options or ideas. Not for a clear goal, a failure, or visual-only work."
argument-hint: <outcome to shape>
---

# Spec

Spec settles every decision the user would notice before any code is written, so the build runs without stopping to ask.

## Steps

1. **Verdict.** State `Verdict: go`, `clarify` or `stop`, and `Objection:`, the likeliest reason the work fails or is not worth doing, backed by code or an existing tool. `clarify` asks the one question that makes it `go`; `stop` writes no brief and names what already covers the request.
   - Fast route: under three files with a known proof, skip questions and plan; `exo:build` edits directly.
   - The user asked for options or ideas: follow `references/architecture-sketch.md` instead of the steps below; its draw command is `node "${CLAUDE_SKILL_DIR}/scripts/draw-seats.mjs"`.
2. **Find the open decisions.** Run `node "${CLAUDE_SKILL_DIR}/scripts/repo-map.mjs"` and search its output with `grep -n`. Before you send researchers, write a throughput checkpoint of one line each: blocking steps, independent workstreams, shared state and smallest split; write `n/a` and why for an item that does not apply. For ranges it omits, send up to four `exo:researcher` agents (`Sources: repo`) and one (`Sources: docs`) for outside facts in one background message. Record what code answers; ask none of it.
3. **Ask one at a time.** Ask only for a preference or product outcome only the user knows, where a wrong guess is costly to undo. Take a safe default silently, recorded in Decisions ending `(exo decided)`. Each question: a bold title ending in `?`, two or three lines `- **(A) Label**: what the user gets`, then `Recommended: (A), because <reason>`. `ok` or a second "I don't know" takes the recommendation. A decision the user left open stays open.
4. **Write the brief** in the shape of `references/example-plan.md`. Read the `specs` setting with `node --input-type=module -e "import { settingValue } from '${CLAUDE_PLUGIN_ROOT}/lib/settings-store.mjs'; console.log(settingValue('specs'))"`, store the brief where it prints, and name the place:
   - `docs`: `docs/specs/<topic>.md`; never `git add` it. In plan mode, the harness plan file.
   - `issues`: one GitHub issue whose body opens `<!-- exo:spec -->`, with only labels and fields the repository already defines; build reads its copy at `node "${CLAUDE_PLUGIN_ROOT}/lib/scratch-path.mjs" specs/<n>.md`. With no GitHub `origin` or a failing `gh auth status`, write the file and say so.
   - `both`: the file, then the issue naming it; the file wins when they differ.
   - New wishes for an outcome that already has a brief (a `#<n>`, path, branch handoff, `<!-- exo:spec -->` issue or `docs/specs/` file) edit that brief in place, and its decisions stay closed unless the wishes contradict them.
   - `node "${CLAUDE_SKILL_DIR}/scripts/plan-template.mjs" done --plan <brief> --root <root>` chains the commands of the project's definition-of-done file onto the Success criterion.
5. **Check it.** Run `node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --plan <brief>` and `node "${CLAUDE_SKILL_DIR}/scripts/verdict-check.mjs" --plan <brief>` and fix what they flag.
6. **Open points.** Unless the plan has at most 3 tasks with static proofs, dispatch `exo:researcher` (`Sources: repo`) in the background with the brief path, to read it as a builder who cannot ask anyone and list each point where a wrong guess changes the build as `code` (answer and `path:line`), `assume` (cheap to undo) or `user`. Put `code` and `assume` points under `## Assumptions`, ask each `user` point as in step 3, and list an unanswered one under `## Open points`, which `plan-check.mjs` refuses. Then rerun step 5.
7. **Hand off.** Invoked by another stage: return without asking. In plan mode, plan approval is the reply. Else show the brief path or `#<n>`, say that `exo:build` runs it next and start nothing before the reply. On `ok`, invoke `exo:build` with the brief path; on a change, edit the brief, rerun step 5 and ask again.
