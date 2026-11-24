---
name: spec
description: "Shapes a request into a brief: the decisions only the user can make, then a plan of tasks that each carry a proof command. Use when the user asks to plan or spec a change ('plan this', 'write a spec'), when a request leaves done, data, architecture or a trade-off open, or the user asks for design options for a change. Not for a clear goal, a failure, visual-only work, or ideas on another question (exo:ideas)."
argument-hint: "outcome to shape"
metadata:
  author: exo
  tags: [spec, plan, brief]
---

# Spec

## Purpose

Spec settles every decision the user would notice before any code is written, so the build runs without stopping to ask.

## Prerequisites

`node` and `git`; `gh` when the `specs` setting is `issues` or `both`.

## Instructions

1. **Verdict.** Give a verdict of go, clarify or stop, and an objection, the likeliest reason the work fails or is not worth doing, backed by code or an existing tool; before a question, state both on one line. `clarify` asks the one question that makes it `go`; `stop` writes no brief and names what already covers the request.
   - Fast route: under three files with a known proof and no open choice, skip questions and plan; `exo:build` edits directly.
   - The user asked for design options for a change (ideas on any other question go to exo:ideas): follow `references/architecture-sketch.md` instead of the steps below; its draw command is `node "${CLAUDE_SKILL_DIR}/scripts/draw-seats.mjs"`.
2. **Find the open decisions.** Run `node "${CLAUDE_SKILL_DIR}/scripts/repo-map.mjs"` and search its output with `grep -n`. Unless the change looks like at most 3 tasks, write a throughput checkpoint of one line each: blocking steps, independent workstreams, shared state and smallest split; write `n/a` and why for an item that does not apply. For ranges it omits, and unless the change looks like at most 3 tasks, send in one background message up to four `exo:researcher` agents (`Sources: repo`), each with the Agent tool's `model: haiku` and `effort: high`, and one (`Sources: docs`) for outside facts that keeps its agent file's model and effort and whose prompt tells it to check each specific with WebSearch or WebFetch even when it feels sure. Record what code answers; ask none of it, and take into Facts only a claim a researcher labelled measured.
   - Unless the change looks like at most 3 tasks, keep a notes file from here on, at the path `node "${CLAUDE_PLUGIN_ROOT}/lib/scratch-path.mjs" specs/<topic>-notes.md` prints, and append each code answer, researcher result path and user answer the moment it lands.
   - Read researcher returns only: the lead opens no result file and runs no fact check of its own; send an unclear point to a fresh `exo:researcher` as one bounded question.
   - After a compaction, read the notes file, or when its name is lost the newest `*-notes.md` in that `specs/` folder, go on at the first step it does not cover, and check no fact it holds again.
3. **Ask one at a time.** Ask every choice that code or the web cannot prove, one question at a time and at most 3 per round; list the rest under `## Open points`, which `plan-check.mjs` refuses until they are answered. Each question: a bold title ending in `?`, its context, two or three lines `- **(A) Label**: what the user gets`, then a last line that names the recommended letter with its reason. Nothing follows the recommendation. `ok` takes the recommendation; a second "I don't know" leaves the point under `## Open points`. A decision the user left open stays open.
4. **Write the brief** in the shape of `references/example-plan.md`, with the fields as `references/field-rules.md` says. Read the `specs` setting with `node --input-type=module -e "import { settingValue } from '${CLAUDE_PLUGIN_ROOT}/lib/settings-store.mjs'; console.log(settingValue('specs'))"`, store the brief where it prints, and name the place:
   - Every route that reads an issue body (`issues`, `both`, build's re-read of `specs/<n>.md`, editing a `#<n>` or `<!-- exo:spec -->` brief in place) uses or rewrites that issue only when `gh issue view <n> --json author --jq .author.login` equals `gh api user --jq .login`; for another author, or when `gh` cannot tell the author, show its Land gate, Worktree setup and Proof commands and ask before using it.
   - `docs`: `docs/specs/<topic>.md`, which build commits on its branch so the pull request carries it. In plan mode, the harness plan file.
   - `issues`: one GitHub issue whose body opens `<!-- exo:spec -->`, with only labels and fields the repository already defines; build reads its copy at `node "${CLAUDE_PLUGIN_ROOT}/lib/scratch-path.mjs" specs/<n>.md`, and when that file is missing because the system emptied the temp folder, writes it again from `gh issue view <n> --json body --jq .body`. With no GitHub `origin` or a failing `gh auth status`, write the file and say so.
   - `both`: the file, then the issue naming it; the file wins when they differ.
   - New wishes for an outcome that already has a brief (a `#<n>`, path, branch handoff, `<!-- exo:spec -->` issue or `docs/specs/` file) edit that brief in place, and its decisions stay closed unless the wishes contradict them.
   - `node "${CLAUDE_SKILL_DIR}/scripts/plan-template.mjs" done --plan <brief> --root <root>` chains the commands of the project's definition-of-done file onto the Success criterion.
   - Unless the change looks like at most 3 tasks, send one `exo:builder` with the Agent tool's `model: opus` and `effort: medium` the notes file, the researcher result paths, both references and one file path for the brief: the `docs` or `both` path, or with `issues` the path `node "${CLAUDE_PLUGIN_ROOT}/lib/scratch-path.mjs" specs/<topic>.md` prints. Then run step 5 on that file yourself, and with `issues` or `both` post the issue as above.
5. **Check it.** Run `node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --plan <brief>` and `node "${CLAUDE_SKILL_DIR}/scripts/verdict-check.mjs" --plan <brief>` and fix what they flag.
6. **Would the builder have to guess?** Unless the plan has at most 3 tasks, dispatch `exo:researcher` (`Sources: repo`) in the background with the brief path, to read it as a builder who cannot ask anyone and return each point where a guess changes the build as a Fact line with its `path:line` or URL, or as a question for the user. Put each Fact under `## Facts` only when the researcher labelled it measured; send an inferred or guess claim to a fresh `exo:researcher` as one bounded question, or to the user. Ask each user question as in step 3, and list an unanswered one under `## Open points`. Then rerun step 5.
7. **Hand off.** Invoked by another stage: return without asking. In plan mode, plan approval is the reply. Else show the brief path or `#<n>`, say that `exo:build` runs it next and start nothing before the reply. On `ok`, invoke `exo:build` with the brief path; on a change, edit the brief, rerun step 5 and ask again.
8. **Replan.** On `PLAN DRIFT` or a Decision proven wrong, edit only the tasks with no `Plan-task:` commit, keep the other Decisions closed, rerun step 5 and append one `## Log` line to the brief.

## Examples

Request: "plan a dark mode toggle".

```
Verdict: go. Objection: the theme is hard-coded in three stylesheets.

**Where is the choice stored?**
- **(A) Browser only**: it resets on another device
- **(B) Account**: it follows the user
Recommended: (A), because no backend change is needed.
```

After the answer, the brief is stored where the `specs` setting says and the reply names its place.

## Limitations

- Spec writes no code and starts no build before the reply.
- Spec asks every choice that code or the web cannot prove and takes no default of its own.

## Troubleshooting

| Error | Cause | Solution |
| --- | --- | --- |
| `plan-check.mjs` refuses the brief | An `## Open points` entry has no answer | Ask the open point as in step 3, then rerun step 5 |
| `Verdict: stop` | An existing tool already covers the request | Write no brief and name that tool |
| `gh auth status` fails or no GitHub `origin` | The `issues` setting cannot reach GitHub | Write the file and say so |
| `PLAN DRIFT` from a builder | A Decision proved wrong | Follow step 8 |

## Available Scripts

| Script | Purpose | Arguments |
| --- | --- | --- |
| `repo-map.mjs` | Maps the repository for step 2 | none |
| `draw-seats.mjs` | Draws 3 seat and forbidden-move pairs for options | none |
| `plan-template.mjs` | Chains the definition-of-done commands onto the Success criterion | `done --plan <brief> --root <root>` |
| `plan-check.mjs` | Checks the brief against the plan rules | `--plan <brief>` |
| `verdict-check.mjs` | Checks the brief's Verdict and Objection | `--plan <brief>` |
