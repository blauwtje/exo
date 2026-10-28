# Flow speed research: where real spec, build and verify time goes

A record, no candidate and no paid run. It profiles 23 real exo sessions (2026-10-04 to 2026-10-28), lists the researched speed ideas with their sources, and names the ideas queued for an `exo:improve` loop. No flow behavior changes in this run; the loop keeps a commit only when the score improves.

## Method

- Transcripts: lead `.jsonl` plus `subagents/agent-*.jsonl` and `.meta.json` of 23 sessions: 15 full spec, build, verify flows, 6 build and verify, 2 spec and build. No model calls.
- Phase = last marker on the lead: `/exo:<phase>` command, `Skill exo:<phase>`, or dispatch of a phase agent (find-open-points is spec; run-unit and build-task are build; review-branch, fix-review or a subagent calling `exo:verify` are verify). A phase ends at a non-phase slash command or a user message after 20 min idle.
- Every gap between consecutive lead events is attributed once along the critical path: a model response is model time; a pending foreground tool is that tool, and an Agent tool recurses into the child; a running background agent or shell takes the gap it covers; a turn end or `AskUserQuestion` is user wait and is excluded.
- Wait loops (`sleep` or `until` loops, `wait-report`, `wait-checks`, `Monitor`, `TaskOutput`) keep the label "wait" only while no child runs.
- Active time is 19.8 h; user wait (4.6 h) is excluded. The profiler scripts stay in the git-ignored `.exo/flow-speed/scripts/` and are not committed.
- Reddit was read only through the `obscura` CLI; GitHub through first-party repo files. All research figures are design claims or token counts, none a wall-clock number for a full flow.

## Phase shares

| Phase | Sessions | Mean s | Median s | Share of active time |
|---|---:|---:|---:|---:|
| spec | 17 | 299 | 291 | 7.1% |
| build | 23 | 2001 | 942 | 64.7% |
| verify | 21 | 953 | 689 | 28.1% |
| all | 23 | 3092 | 2634 | 100% |

Spec is 7.1%, so at most one spec-speed idea is queued. Per phase groups:

| Phase | Largest groups |
|---|---|
| spec (5078 s) | lead model 59.8%, subagent model 31.5%, Bash 4.7% |
| build (46024 s) | subagent model 43.2%, wait loops 29.3%, Bash 19.9%, lead model 6.0% |
| verify (20004 s) | subagent model 48.1%, Bash 23.0%, lead model 16.3%, wait loops 11.9% |

Counts per session: build had 2.9 run-unit spawns, 2.5 build-task re-dispatches and 1.8 SendMessage resumes; verify had 3.4 review-branch spawns and 1.5 fix-review spawns. The BLOCKED count (2.3 per build session) overcounts: it matches the word in any notification result, including land-task output text.

## Top 10 steps (all phases)

| # | Step | Total s | Share of active time |
|---:|---|---:|---:|
| 1 | model in exo:build-task | 12271 | 17.3% |
| 2 | lead model | 9045 | 12.7% |
| 3 | wait sleep-loop | 8904 | 12.5% |
| 4 | model in general-purpose | 8518 | 12.0% |
| 5 | wait wait-report | 6971 | 9.8% |
| 6 | Bash other | 4829 | 6.8% |
| 7 | Bash land-task | 4007 | 5.6% |
| 8 | model in exo:review-branch | 3474 | 4.9% |
| 9 | model in exo:fix-review | 2433 | 3.4% |
| 10 | model in exo:run-unit | 2355 | 3.3% |

The 3 slowest sessions (all roblox-kit or build-heavy): `38bece4d` 8161 s (build-task model 31.3%, sleep-loop 25.9%, wait-report 25.4%), `a2673e8e` 6864 s (wait-report 69.3%), `44e1f9b2` 6362 s (land-task 23.7%, Bash other 17.7%, solve-hard 13.6%).

## Wait patterns

Steps 3 and 5 together are 15875 s, 22.3% of active time, and none of it ran a child agent. Commit `3431278d` (2026-10-28 11:34 +0100, `fix(build): end agent and script waits on the harness completion notice`) removed them: `wait-report` polled a report file every 5 s with a fixed 540 s deadline and no pid or exit check, so a dead child idled until the deadline. Only 1 of the 23 sessions ran after the cut, so the profile shows the waits as they were; they count as fixed, not as an open idea.

Sleep-loop commands, 8905 s in 163 commands over 19 sessions, all before the cut:

| Pattern | Seconds | Share | Commands | Sessions |
|---|---:|---:|---:|---:|
| background process wait by pid or pgrep (headless script, fix-review, run) | 2179 | 24% | 15 | 6 |
| git status poll for a worktree change | 2010 | 23% | 5 | 2 |
| benchmark or harness log poll | 1174 | 13% | 20 | 9 |
| implementer report or process poll (run-unit, build-task) | 1104 | 12% | 3 | 3 |
| fixed sleep before the next command | 901 | 10% | 48 | 14 |
| `npm run check` or verify log poll (SUMMARY) | 836 | 9% | 9 | 6 |
| not a wait: script that merely contains sleep or until | 383 | 4% | 50 | 14 |
| `gh run` status poll | 279 | 3% | 1 | 1 |
| background agent output file poll, other sleep loop | 38 | 0% | 12 | not split |

The longest single wait was 807 s on a `kill -0` loop for a design-loop script in `tools-deepseek-repair-proxy`. Of 4820 s in "Bash other", 2615 s (54%) is exo benchmark or pressure runs and 886 s (18%) project eval scripts: benchmark work, not flow time. After the cut, wait time is 0 s and "Bash other" is 16 s, from 1 session.

What remains is model time: build-task, general-purpose, review-branch and fix-review are 37.6% of active time between them (12271, 8518, 3474 and 2433 s), and `land-task` Bash is 5.6%. In the verify phase, `review-branch` is spawned once per shard (`review-input.mjs:123`), once for overlap, and once per fixer pass (`REPAIR_BOUND` 2, `verify.mjs:70`).

## Sources

Stars or upvotes are as read on 2026-10-28; "not recorded" means the source note gave no count.

### GitHub

| Repo | Stars | File | Idea | Ledger status |
|---|---:|---|---|---|
| get-shit-done | 64198 | https://raw.githubusercontent.com/glittercowboy/get-shit-done/main/get-shit-done/workflows/execute-phase.md | small phases (3 plans or fewer, no deps) run inline, no subagent spawn | new, not queued |
| get-shit-done | 64198 | same file | post-wave completion check from the filesystem (summary file, commits) instead of waiting on a signal | new, mostly covered by `3431278d` |
| get-shit-done | 64198 | same file | same-wave plans fan out in worktrees, file overlap forces serial | landed (Fan out first wave) |
| get-shit-done | 64198 | `agents/gsd-executor.md` | stall guard: 5 consecutive read-only calls means write code or report blocked | new, queued as `build-task-stall-guard` |
| get-shit-done | 64198 | `agents/gsd-executor.md` | auto-fix cap of 3 attempts per task, out-of-scope failures deferred | probably new, not queued |
| obra skills repo | not recorded | `skills/subagent-driven-development/SKILL.md` on the repo's main branch | script packages the review diff into one file | rejected (Review diff file under spill size) |
| obra skills repo | not recorded | same file | resume the same implementer for fix rounds | rejected (Resume builder for repair) |
| obra skills repo | not recorded | same file | fix-round re-review checks the fixes only | un (Verdict-first review output, `--diff-only`) |
| obra skills repo | not recorded | same file | cheapest model tier for mechanical tasks | rejected (Haiku for run-unit) |
| spec-kit | not recorded | https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/implement.md | `[P]` parallel marks, same-file tasks serial | landed (Fan out) |
| claude-plugins-official code-review | not recorded | https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/code-review/commands/code-review.md | haiku pre-flight gate ends review for a trivial or already reviewed change | new, not queued (review skipping) |
| claude-plugins-official code-review | not recorded | same file | cheaper tier for non-judgment review steps, opus for bugs | rejected for judgment steps (sonnet 6.7% vs opus 37.5% catch); new for non-judgment steps, not queued |
| claude-plugins-official code-review | not recorded | same file | bug reviewers read the diff alone, no exploratory calls | un (Verdict-first review output, `--diff-only`) |
| claude-plugins-official code-review | not recorded | same file | 4 reviewers plus a validator per issue | rejected (Reviewer fan-out) |
| claude-plugins-official pr-review-toolkit | not recorded | https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/pr-review-toolkit/commands/review-pr.md | a specialist reviewer runs only when the diff touches its area | new, not queued (review skipping) |
| claude-plugins-official pr-review-toolkit | not recorded | same file | parallel review opt-in | exo is already parallel |
| claude-plugins-official feature-dev | not recorded | `feature-dev.md` in the same plugin set | 2 to 3 explorers and architects in parallel, five user gates | gates cost time, not queued |
| wshobson/agents | 41938 | `plugins/agent-teams/commands/team-feature.md` | exclusive file ownership per stream, mid-run rebalance | rejected (More than 4 slots) |
| ccpm | 8423 | `skill/ccpm/references/execute.md` | stream hour estimates, ready streams launch together | rejected (dependent task refill) |
| ccpm | 8423 | same file | one shared epic worktree, preflight stop on a dirty tree | new, low saving, not queued |
| aider | 49795 | `aider/coders/architect_coder.py` | architect and editor split with a cheap editor | quality only; rejected (Haiku for run-unit) |
| aider | 49795 | aider edit formats and repomap | editor overhead stripped; search/replace diff output; ranked repo map | Edit already diffs; exo has `repo-map.mjs`; not queued |
| Agentless | 2133 | `agentless/repair/repair.py` | one greedy sample, then N-1 samples in one batched cached call | new, not queued |
| Agentless | 2133 | README | hierarchical localize, narrow repair, regression-test selection; measured $0.34 per issue | rejected (Affected-only test selection) |
| opencode | 222722 | https://github.com/sst/opencode/blob/dev/packages/codemode/README.md | code mode: the model writes a small program that calls tools, independent calls in parallel | new, not queued (Batched read verb and Parallel-tool-call line rejected) |
| opencode | 222722 | docs `config/agents` | small model for side tasks, read-only explore subagent, prune old tool output | partly new; the small-model part is queued as `haiku-for-search-agents` |
| goose | 55869 | `summon-mcp` docs | background delegation: the parent keeps working and loads the child result by task id | un (Lead stages verify while run-unit builds); event-driven wait rejected |
| goose | 55869 | gastown blog | shared append-only log read by parallel delegates | new, anecdotal, costs more, not queued |
| goose | 55869 | docs | concurrency cap 5; subagent turn cap with a 5 min timeout; cheaper subagent model | rejected (More than 4 slots); un (maxTurns cap); rejected (Haiku for run-unit) |
| kilocode | 27780 | orchestrator docs | background delegation, same as goose | same as goose |
| cline | 70991 | docs | context condensing in the lead | rejected (condensed lead context) |
| Roo (archived) | 24255 | boomerang docs | a subtask returns only a summary | rejected (one verdict line plus report path) |
| OpenHands | 92116 | docs | resumable blocking subagent; context condensing | weak; rejected (condensed lead context) |
| mini-swe-agent, codex, SuperClaude, task-master | 8920, 131435, 23917, 28277 | listed in the batch notes only | no usable speed idea (task-master fetch returned 404) | none |

One spec framework returned 404 and spec-workflow-mcp was not read.

### Reddit (r/ClaudeCode, via `obscura`)

About 29 fetches; the last were rate limited or blocked. Search results carry no scores, so scores come from thread HTML. No thread gave a wall-clock number for a spec, plan, build, review, verify flow.

| Thread | Upvotes | URL | Idea | Ledger status |
|---|---:|---|---|---|
| T1 | 49 | https://www.reddit.com/r/ClaudeCode/comments/1upt8mr/ | pick a mode up front, quick fix skips spec, plan and the subagent loop | new as a whole-flow bypass, not queued (skips gates) |
| T1 | 49 | same thread | run a few-file task in one session, no subagent hop | rejected (Build lead runs the run-unit loop itself; Builder lands its own task) |
| T3 | 392 | https://www.reddit.com/r/ClaudeCode/comments/1wbc03f/ | no agent for a one-line fix or a single grep | new as a threshold; adjacent to commit `35050e9e`, not queued |
| T3 | 392 | same thread | batch related fixes so one fixer reads each file once | new, not queued |
| T3 | 392 | same thread | haiku for search-only agents; a 22-item search matched Sonnet with 25% fewer tokens | new, queued as `haiku-for-search-agents` |
| T3 | 392 | same thread | large agent output goes to a scratch file, the next agent reads it | rejected (one verdict line plus report path) |
| T3, T4 | 392, 600 | same thread; https://www.reddit.com/r/ClaudeCode/comments/1sciznh/ | read-only research in parallel, never two editors on the same files | landed (Fan out first wave); More than 4 slots rejected |
| T4 | 600 | same thread | 4 to 8 parallel worktree sessions across features | usage pattern across runs, not a plugin change; not queued |
| T2 | 428 | https://www.reddit.com/r/ClaudeCode/comments/1v6y5q2/ | Claude Code 2.1.219 and 2.1.220 inject "Do not call the AgentTool unless the user requested it" for Opus 5 (anthropics/claude-code#80988), so delegation flows can silently run inline | new; a confounder for any Opus 5 wall number, not a speed idea |
| 1vphazv | 216 | https://www.reddit.com/r/ClaudeCode/comments/1vphazv/ | two-agent driver and reviewer pairing | no speed numbers, not usable |

Seen only as titles: 1sd8t5u, 1xbxoza, 1vmey7d, 1te6oti, 1w9233g.

## Queued ideas

Four `un` ideas go to the `exo:improve` loop; the ledger rows land after this run through one worktree subagent. Start the loop with:

`/exo:improve cut flow-unit build and verify wall time and cost; take ideas from benchmarks/speed-ledger.md entries marked un, first build-task-stall-guard, lead-stages-verify-while-run-unit-builds, verdict-first-review-output-with-a-finding`

| Id | State | Target | Basis |
|---|---|---|---|
| `build-task-stall-guard` | new `un` row | `agents/build-task.md` | build-task model is the top step at 17.3%; get-shit-done stall guard: 5 consecutive read-only calls means edit or report BLOCKED |
| `lead-stages-verify-while-run-unit-builds` | existing `un` row, source and measurement added, `wait-report` wording dropped | `skills/build/references/run-loop.md`, `skills/verify/SKILL.md` | retry condition met: `lead_to_verify` 24.6 s, over the row's 15 s threshold; goose and kilocode background delegation |
| `verdict-first-review-output-with-a-finding` | existing `un` row, source and measurement added | `agents/review-branch.md` | review-branch plus fix-review are 8.3% of active time; code-review "no exploratory calls" and obra skills repo fix-round scope; retry needs a seeded-defect catch rate |
| `haiku-for-search-agents` | new `un` row | `agents/locate-code.md`, `agents/find-open-points.md` | the one spec-speed idea: locate-code and find-open-points are 19.7% of spec time; T3 and opencode report equal results from a smaller model at 25% fewer tokens (tokens, not wall time) |

The flow-unit baseline is round 8: wall 136.6 s, $0.598 (`2026-10-20-speed-round8.md`); time is model latency, so a gain shows as fewer model turns, not fewer waits.

## Not queued: ideas that skip or shrink review

Every quality gate stays. These ideas trade review for speed, so they stay out of the ledger as `un`:

- Haiku pre-flight gate that ends review for a trivial or already reviewed change (claude-plugins-official code-review). The ledger already holds "A new, test-first module needs no branch review" as `un`.
- Specialist reviewer only when the diff touches its area (pr-review-toolkit `review-pr.md`): a missed area is a missed defect.
- Quick-fix mode that skips spec, plan and review (Reddit T1) and no agent for a one-line fix (Reddit T3).
- Cheaper tier for judgment review steps: rejected at sonnet 6.7% against opus 37.5% catch rate.
- Review sharding, overlap review and the fix-diff review count 3.4 spawns per verify session, but merging them would shrink coverage; only cheaper output of the same review (the verdict-first row) is queued.
