# Consolidation decisions

Criteria: faster, cheaper, higher quality on Opus 5.5, less main-session context, fewer skills and agents to remember. Evidence: `.exo/research/consolidate/` inventory, anthropic and repo notes, and the speed ledger.

## Skills

- Choice: 8 skills by lifecycle phase (spec, build, gate, find-cause, ship, write-docs, edit-skills, watch) plus save-session and configure kept separate, because it cuts the count most while each survivor owns one phase or one user job; rejected: a start umbrella (misleading name, never used), 5 skills (folding watch, write-docs and edit-skills hides their triggers).
- Choice: a folded skill folder is deleted and its body moves to `<owner>/references/<name>.md` and its scripts to `<owner>/scripts/`, all by the task 7 script, because 8 checkers and `harnesses/codex/generate.mjs` read only `SKILL.md` and `references/`, so no checker needs a special case and no old path stays alive as a shim; rejected: MODE.md folders (every walker needs a special case forever, old paths stay as shims), inlining the body into the owner SKILL.md (a bigger load on every skill call).
- Choice: spec absorbs research, ideate and check-docs as modes, because all three decide before a change and the user asked research and ideate to merge; rejected: a separate `research` skill with ideate as a mode (one more name to remember).
- Choice: build absorbs run-plan, refactor, improve and design-ui as modes, because each one changes code under a plan or proof; rejected: keeping design-ui separate (its trigger is already a task `Design:` field build reads).
- Choice: gate absorbs review, because both run the branch judge; ship absorbs file-issues, because both put work outside the machine; rejected: review inside ship (ship would then judge code).
- Choice: edit-skills absorbs prompt and remember, because all three edit instruction or memory text; rejected: remember in another skill (memory writes are instruction edits).
- Choice: routing rule "Unclear: spec. Clear: build. Broken: find-cause. Leaving the machine: ship. About exo: save-session or configure.", because five words cover every user-typed entry and gate, write-docs, edit-skills and watch route by the model from their trigger; rejected: a table of 9 rows (harder to remember), one `exo` entry skill with sub-modes (one long description over the 1,536-character cap).

## Agents

- Choice: 5 agents (orchestrator, task-runner, build-task, research-worker, review-branch), because the ledger keeps the lander, writer and judge apart and every other agent is a reader or a duplicate; rejected: 3 agents (folding task-runner into orchestrator repeats fold-unit, +27% wall), 7 agents (keeps locate-code and fetch-docs, two more names for the same read role).
- Choice: research-worker absorbs ideate-worker, fetch-docs, locate-code and find-open-points, chosen by a `Sources: repo | web | docs | brief` brief line, because all five read and write one result file; rejected: two readers, repo and web (no measured gain, one more name).
- Choice: review-branch absorbs claim-judge, because both are skeptical evaluators kept apart from the doer (docs/principles/agent.md); rejected: claim-judge inside research-worker (doer judging itself).
- Choice: build-task absorbs solve-hard and fix-review, with effort set by the brief's `exo-kind:` line, because role-specific effort is the proven lever and the kind line already carries it; rejected: keeping solve-hard for effort alone (the kind line gives the same effort with one less agent).

## Dispatch flow

- Choice: build, gate, find-cause, ship, write-docs, edit-skills and watch get `context: fork` and `agent: orchestrator`, because the body and every worker return then stay out of main and only the verdict returns; rejected: each skill dispatching the orchestrator by an Agent call (the skill body still loads in main and stays there), fork into general-purpose (loses orchestrator rules and budgets).
- Choice: spec keeps its question phase in main and hands steps 4 to 8 to one orchestrator dispatch, because a forked agent cannot ask the user; save-session stays inline, because it must read the conversation; rejected: forking spec whole (questions become guesses).
- Choice: the orchestrator does small work itself and dispatches a worker only for parallel parts or a guard role (lander, judge), because improve's inline mode and fold-unit show that a hop costs time on small scopes; rejected: always dispatching (8k cache-write tokens per cold start).
- Choice: on a pause, question or BLOCKED the orchestrator returns it as its verdict and main re-dispatches with the answer, because build resumes from plan state; rejected: SendMessage back to main (not supported from a subagent).

## Context budget per hop

- Choice: main holds at most the exo session injection, a launcher body under 300 tokens and each verdict under 200 tokens, with a 30k-token build-run target, because the measured lead is 66.1k; rejected: no target (the regression would go unseen).
- Choice: the orchestrator works under the existing 45k note, 60k refuse and 75k hard limits and loads references on demand; a worker gets a brief under 2k tokens of paths and returns one verdict line plus a result path, with a result file of at most 40 lines; rejected: larger worker returns (the ledger saw no gain from returns, so keep them small).

## Defect

- Choice: make the orchestrator's named result file always writable by fixing the refusal at its source, because a refused Write sends the full result into main. The refusal text "Subagents should return findings as text, not write report files" was observed from the harness Write tool in this run on a file named `report.md`, so task 1 first rules exo in or out, then fixes exo's rule or names result files so the harness guard does not fire; rejected: a prose line asking agents to retry (does not reach the source).

## Karpathy report

- Choice: fold ranked change 6 (keep a skill only when it owns one phase), because it is the rule this merge map applies.
- Choice: fold ranked change 7 (retry cap and timeout in every orchestrator brief, BLOCKED with options at the cap), because it bounds the new long-running hop at no main cost.
- Choice: fold ranked change 3 (model and effort per agent, higher effort only for the hard kind), because it is how build-task absorbs solve-hard.
- Choice: fold ranked change 5 as Acceptance (the merge lands only when `npm run check` holds and skill plus agent bytes shrink), because it measures "simpler"; rejected: ranked changes 1, 2, 4, 8 to 15 (proof protection, per-task autonomy, ledger columns, blind reviews, diff caps, docs lint, held-out tuning), because none changes the skill or agent count and each needs its own spec.

## Platform facts and open choices

- Choice: keep `agent: orchestrator` in launcher frontmatter and prove it in task 11, falling back to a plain orchestrator dispatch from the launcher body, because `agent:` documents only built-ins and `.claude/agents/` agents while plugin agents register as `exo:<name>`, so `agent: exo:orchestrator` is likely but unverified; rejected: assuming it works (a silent fall to general-purpose loses the orchestrator rules), dropping fork now (the launcher body then loads in main).
- Choice: a launcher sets `background: false`, because a `context: fork` skill runs in the background by default and the verdict must arrive in the same turn; rejected: the default background run (verdict arrives later, build cannot report), `-p` only (not the interactive path).
- Choice: a launcher body is written as the whole prompt of the fork, with paths and the user's request and no reliance on history, because a fork sees no main history and gets the skill text as its prompt; rejected: a body that says "as discussed" (the fork cannot see it).
- Choice: launchers leave `model` unset and set `effort: medium` only on cheap routers, because the orchestrator coordinates and Opus 5.5 defaults to medium; rejected: `xhigh` on every launcher (cost and cache misses with no quality gain on routing), `low` on build (build judges proof).
- Choice: the orchestrator keeps subagent depth at the default 3 and workers omit `Agent` from their tools, because main, orchestrator and worker is 2 layers and nothing below a worker is wanted; rejected: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` (blocks the orchestrator from dispatching), allowing worker fan-out (budget loss).
- Choice: a worker runs at `low` effort unless the brief's `exo-kind:` line names a hard kind, because `low` suits subagents on Opus 5.5 and `xhigh` is for agentic runs over 30 minutes; rejected: one effort for all workers (overpays readers), `xhigh` for build-task (reserved for the hard kind).
- Choice: keep the tool list and effort of an agent fixed across a run and put variation in the brief, because a tool-list change invalidates the whole cache and an effort change invalidates message blocks, with reads at 0.05x; rejected: per-call tool lists (cache miss every dispatch).
- Choice: keep each agent's shared prefix above 512 tokens, the Opus 5.5 cache minimum, by putting the stable rules first and the brief last; rejected: a minimal agent prompt under 512 tokens (silently never cached).
- Choice: the result-file fix of task 1 may add a PreToolUse allow in `hooks/dispatch-edit.mjs` keyed on `agent_type` and the brief's `Result:` path, because PreToolUse hooks fire for subagent tools with `agent_type` in the input, so a hook can allow a subagent Write; rejected: a prose retry line (does not reach the source), renaming every result file only (kept as the fallback when the harness owns the text).
- Choice: a worker returns a summary of 1 to 2k tokens at most, here one verdict line plus a result path, and its brief states objective, output format, tools and boundaries, because the parent receives only the summary plus an `agentId`; rejected: free-form worker returns (main context growth).
- Choice: tasks 2 to 4 fold the read-only agents in three small tasks and tasks 11 and 12 split the launchers from spec, because each task must stay under 15k tokens; rejected: the original tasks 2 and 8 (22.4k and 21.5k tokens, over the limit).
- Choice: the research kind gets `ceiling: high` so a high session lifts research-worker's effort as open-points did; rejected `max` (cost) and dropping the ceiling test.

Choice: fold claim-judge into review-branch, and fix-review and solve-hard into build-task, through `labels` on the existing agent entries and `exo-kind:` lines, with the kinds kept; rejected: a new `Mode:` brief line (needs hook and parser changes), keeping the kinds out of the table (loses per-mode model and effort).

Choice: mark a fix round by the explicit fix mode marker in the build-task brief and count it in improve-speed, checkpoint-fork, sweep-score and session-stats; rejected: keeping the fix-review name (undoes the merge), dropping the metric (loses the quality column the speed ledger needs).

## Prune audit

Choice: fold each skill with one committed script (`verify/fold-skills.mjs`, task 7) plus a fold-map check in `npm run check`, because the same five edits repeat in tasks 6 to 10 and the check keeps old skill and agent names and paths out after the run; rejected: hand edits per task (repeated discovery, no guard), a one-off script alone (no guard).

Choice: the script rewrites `${CLAUDE_SKILL_DIR}` in a moved body to `${CLAUDE_PLUGIN_ROOT}/skills/<owner>/`, because a reference is read with Read, which substitutes no variable, and this form does not depend on which skill loaded the file; rejected: `${CLAUDE_SKILL_DIR}/../<owner>/` (depends on the loader).

Choice: task 11 alone sizes launcher bodies, tasks 8 to 10 write their mode rows straight into the owner References table, and the 300-token cap binds only the fallback path, because a forked body never enters main; rejected: trimming gate in tasks 9 and 11 (duplicate work), moving every table out under a working fork (one more Read per run, no main saving).

Choice: a forked build ends its verdict with `Next: gate <plan>` (or `Next: find-cause <report>`) and the main session launches that skill without asking, because the orchestrator has no Skill tool and gate needs a fresh context; rejected: gate inside the build subagent (cannot start, costs that orchestrator workers and context), a Stop hook (overhead every session), adding Skill to the orchestrator (nested fork unverified, contexts stack).

Choice: the module-size ceilings raised in 123470fd go back to their earlier values and the code is trimmed to fit (done by another worker, outside this plan), because budgets that grow by drift stop binding; rejected: keeping the raise.

Choice: dead agent and skill names are found by the fold-map check, not by a hand list, because 43 files still name folded agents and several sit outside every task's Files; rejected: a hand list (stale while tasks run).

Choice: a task's Proof runs every test file it edits, because tasks 8, 9, 10 and 12 edited tests they never ran; rejected: deferring them to the Success criterion (a late red costs a full rerun).

Choice: delete the docs pages of folded skills and give each owner page a `## Modes` section in task 13, because no file links them; rejected: redirect stubs (dead files), editing each page (duplicate text).

Choice: start-run runs once when the plan is named and its basis names Repository and Branch, because the find adds nothing then; rejected: always finding first (one redundant call per run).

Choice: keep the runner's own next-task call, because slot state can change between the lead's call and the dispatch; rejected: passing the lead's block output (stale slots, unmeasured).

Choice: a forked build uses its run state as the result file and writes no handover template, because build resumes from plan state; rejected: a second handover file (duplicate state).

Choice: keep the per-call hooks and the per-task Land gate unchanged, because hooks add only 6 to 12 ms over node startup and guard every call, and the tree changes every task; rejected: a bash prefilter for dispatch-bash (it must inspect every command).
Choice: one-line mode table in the owner body, mode text in <owner>/references/<mode>.md, no check change; rejected: modes.md plus a check change (one extra Read hop every call), raising ceilings (more tokens every call), splitting skills again (undoes the merge).

Choice: build keeps 982 as a temporary step, because task 11 rewrites the build body into a launcher; rejected: one file per mode with locks and a sub-folder per mode (moved twice), moving pinned sentences (shared-contracts change for a body task 11 replaces).

Choice: spec keeps its mode rows in references/modes.md because verify/reference-owner-rows.txt and tests/reference-owner-rows.test.mjs require that row and no check changes; the extra Read for a mode request is a known cost.

Choice: routing prompts for design-ui and refactor expect build, and save-session prompts keep expecting save-session, because save-session stays its own model-invocable skill; rejected: expecting none (hides the one skill the user uses), dropping the prompts (loses coverage), keeping old names (old-name check refuses them).

Choice: task 9 writes folded review content into one skills/gate/references/ file with at most one pointer line in gate SKILL.md; rejected: moving existing gate text now (moved again in task 11), raising the budget, reordering 11 before 9 (11 depends on 10).
Choice: task 9 adds REFERENCE_TOKEN_LOCKS for the two ship references that arrived over the 750 ceiling (fields.md 1305, file-issues.md 798), as task 8 did for build; rejected: splitting them now (more files, same text), raising the ceiling.

Choice: a sub-folder per mode `<owner>/references/<mode>/`, only the mode file row in the body; reference-tables requires transitive reachability (body row -> `references/<mode>.md` -> its rows `references/<mode>/<file>.md`, and deeper), and an orphan fails naming the file. Rejected: merged files with REFERENCE_TOKEN_LOCKS exceptions (grows with each merge), loosening pinned contracts.


Choice: task 10 deletes start and route-skills, save-session and configure stay separate skills, and each route-skills file a live reader still uses moves to skills/build (references closing, question, lean, code-standard, user-read-format; scripts next-stage.mjs; assets handover-template.md) with readers and tests repointed, while unread files (context, project-structure, cheat-sheet, run, board, overview and the cheat-sheet check) are deleted, and the start body ceiling 486 and the start fold-map owner rows go. Rejected: start as model-invocable umbrella (misleading name, never used), save-session folded into start (hides the one skill the user uses), configure folded into save-session (unrelated job).
Choice: the guard-rules Fetches check is retargeted to research-worker briefs with `Sources: web` or `docs`. Rejected: dropping it (loses the context budget guard), the old fetch-docs name (old-name check refuses it).
Choice: the benchmarks/agent-tier.mjs ceiling raise to 25432 is reverted and the module trimmed or split. Rejected: keeping the raise (drift).
Choice: reword the two local commits whose Evidence lines fail edit-evidence; Rejected: an exemption list (loosens the check), leaving them failing (suite not green).
Choice: fold prompt into edit-skills as a dedupe; rejected keeping prompt as a skill (unused) and deleting its rules (they improve skill writing).
Choice: keep the build References table in the body and set the build body ceiling to its measured 930; rejected moving the table to references/index.md (one extra Read on every build run), a raise to 739 or more (not needed), and merging reference files now (belongs to the prune tasks).
Choice: launchers must name `agent: exo:orchestrator`, because the bare `orchestrator` does not resolve to the plugin agent (fork proof logs .exo/consolidate/fork-forkprobe.log and fork-forkplain.log).
