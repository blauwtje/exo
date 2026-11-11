## Goal
Exo refuses only delete, spend, network and security actions, copies .env files into every new worktree without a question, and keeps only the parts Claude Code does not offer.

## Verdict
Verdict: go
Objection: part D can remove a part that catches something Claude Code misses, so each removal below names a test or a doc line showing Claude Code covers it; Decision 3 settles every doubt.

## Decisions
1. Part B: hard refusals stay only for delete, spend money, network, security; every other refusal is dropped or becomes one warning line on stdout with exit 0.
2. Part C: every new worktree gets the main checkout's gitignored .env files with no question; the `env` setting is removed; a .env file in a commit stays a hard refusal.
3. Part D: on doubt Claude Code's feature wins unless a test shows exo catches what Claude Code misses; no worktree or branch with unlanded work is ever removed.
4. Working principles: assumptions first, simplicity, small change and goal as test are kept as rules in one place, lib/references/lean.md (task 15); session-start rows that only repeat them stay dropped.

## Part B refusal table
| rule | reason | decision |
|---|---|---|
| land: file outside Files at `land-task --check` (land-refusals.mjs:91) | scope drift, no delete, spend, network or security | drop to a warning line (task 6) |
| land: Proof not seen red first (land-refusals.mjs:54) | process check | drop to a warning line (task 6) |
| land: dropped boundary word without `Drops:` | no check exists today | add as a warning line (task 7) |
| land: security-boundary path outside Files, .env in a commit (land-candidate.mjs:92) | security | keep |
| brief-ambiguous-name, brief-missing-path (lib/brief-path-rules.mjs) | helpfulness; refused a real dispatch for an ambiguous `brief.md` and for result files not yet written | warn, done on fix/brief-reads-warn |
| agent-isolation, `isolation: worktree` dispatch (lib/guard-rules.mjs) | hides main-checkout reads, no delete, spend, network or security | warn, done on fix/brief-reads-warn |
| brief-unresolved | helpfulness | drop to one warning line (task 8) |
| brief-worktree hint | path hint, no security effect | drop to one warning line (task 8) |
| brief-lacks-fetches, brief-invalid, brief-lacks-fields, brief-reads-label, brief-lacks-reads, brief-cuts-page | brief shape | warning line (task 8; brief-lacks-reads already warns) |
| brief-over-budget, brief-over-fetches | spend | keep |
| research-unnamed, research-fanout, reddit-route, intake-websearch | network | keep |
| result-tools, task-owner | security | keep |
| stash (git stash in a subagent) | delete, a stash pop can drop another agent's changes | keep |
| shared-state, no-delete | delete | keep |
| code-rules on Edit and Write (dispatch-edit.mjs:33) | style, no hard class | drop to a warning line (task 9) |
| result-line (Read line cap, lib/context-decisions.mjs) | tokens, not money; the Read tool caps its own output | drop to a warning line (task 10) |
| intake-glob (Glob size, lib/context-decisions.mjs) | tokens, not money | drop to a warning line (task 10) |
| persisted-read | tokens spent on overflow | keep |
| context-target | spend, but auto compaction covers it | drop to a warning line (task 10) |
| context-hard, context-lead | spend, compaction can thrash | keep |
| wide-find (find over home or root) | slow, not delete, spend, network or security | already a warning line; stays one |
| script-size (Bash over 4096 bytes) | style, not delete, spend, network or security | already a warning line; stays one |
| sleep, watch, suite, suite-passed, live-shells, run-no-wait, run-stall-guard, refusal-cap, repeat-refusal, repeat-stop, kind-mismatch, workers-line, slice-spent, role-no-dispatch, orchestrator-reads, orchestrator-budget | spend | keep |
| commit-attribution (lib/evidence-rules.mjs) | an AI attribution leaves the machine | keep |
| commit-evidence, `Evidence:` line shape (lib/evidence-rules.mjs:45) | commit text shape, no delete, spend, network or security; cost a round | drop to a warning line (task 17) |
| plan-check hard: no task heading, unparsable task line, Repository missing, Proof not on PATH, Success criterion exits 127, field line lacks Files: or Proof:, Plan basis lacks Repository:, Branch: or Land:, no Success criterion, loop MCP call, plan file in Files:, Branch: is the default branch, backticked or HTML-entity command | the plan cannot run | keep (task 16) |
| plan-check hard: nested claude in a command | spend | keep (task 16) |
| plan-check hard: security boundary without Boundary:, Boundary test not in Files: | security | keep (task 16) |
| plan-check size and token: split Task by code lines (plan-check-text.mjs:76) or by tokens (plan-check-size.mjs:149), tiny tasks, body headroom, headroom skipped, Success criterion timeout | size, tokens; one oversized task stopped a whole run | drop to a warning line with the measured number (task 16) |
| plan-check shape and count: Commit block, git add, Run/Expected, placeholders, whole-suite Proof, bare default branch diff, Risk, Pause, Evidence, Data literal, derived name, missing Modify path, unlisted tests and locks, shared Files without Depends on, Parallel line, Worktree setup, Open points, Red and Land gate rules, Acceptance, Land gate and Lint lines, Product run, loop Land gate, redirect, Autonomy, Commit line, Goal, Checkpoint, Proof and Data warnings | style and count, no delete, spend, network or security | drop to a warning line (task 16) |
| tool-case | instruction only, no test, Claude Code reports an unknown tool | drop (task 13) |

## Part D table
| exo part | what it does | Claude Code covers it | decision |
|---|---|---|---|
| env setting and copy question | asks whether to copy .env | no, `.worktreeinclude` copies only into worktrees Claude Code creates, https://code.claude.com/docs/en/worktrees | drop the setting, keep the copy in lib/checkout.mjs because exo creates its own worktrees (tasks 11, 12) |
| context-target refusal | stops reads past a token target | yes, auto compaction, https://code.claude.com/docs/en/how-claude-code-works | replace by the Claude Code feature (task 10) |
| tool-case rule | asks for exact tool names | partly, tool errors are native, https://code.claude.com/docs/en/tools-reference | drop (task 13) |
| code-rules on Edit and Write | checks written code | no | keep as a warning |
| destructive-git and shared-state guard | blocks stash, worktree and branch deletes | no, only auto mode and deny rules, https://code.claude.com/docs/en/permission-modes | keep |
| secret and .env commit check | refuses .env in a commit | no native scanner | keep |
| remove-worktree and landed check | removes a landed worktree | cleans only clean unnamed worktrees, https://code.claude.com/docs/en/worktrees | keep, patch-equivalence in task 5 |
| agent isolation refusal | denies `isolation: worktree` | yes, subagent `isolation: worktree`, https://code.claude.com/docs/en/worktrees | warn, done on fix/brief-reads-warn |
| brief line `sleep` (lib/speed-rules.mjs) | poll with no sleep | yes, background commands and blocked foreground sleep, https://code.claude.com/docs/en/tools-reference | drop (task 14) |
| brief line `suite` (lib/speed-rules.mjs) | proof tiers and round cap | no; spend refusal kept | keep |
| brief line `watch` (lib/speed-rules.mjs) | no `gh pr checks --watch` | no; spend refusal kept | keep |
| brief line `commit-attribution` (lib/evidence-rules.mjs) | no AI trailer in a commit | no; gates what leaves the machine | keep |
| brief line `stash` (lib/guard-rules.mjs) | no git stash in a subagent | no; delete | keep |
| brief line `shared-state` (lib/guard-rules.mjs) | no worktree or branch removal in a subagent | no; delete | keep |
| brief line `no-delete` (lib/guard-rules.mjs) | never delete to get past a block | no; delete | keep |
| brief line `wide-find` (lib/guard-rules.mjs) | no find over home | its refusal is a warning line | drop (task 14) |
| brief line `script-size` (lib/guard-rules.mjs) | Bash under 4096 bytes | its refusal is a warning line | drop (task 14) |
| brief line `code-rules` (lib/guard-rules.mjs) | Edit or Write refused on a code rule | refusal made warn-only by task 9 | drop (task 14) |
| brief line `result-line` (lib/guard-rules.mjs) | Read over the result cap refused | refusal made warn-only by task 10; the Read tool caps output | drop (task 14) |
| brief line `context-target` (lib/guard-rules.mjs) | refusals past the context target | yes, auto compaction, https://code.claude.com/docs/en/how-claude-code-works | drop (task 14) |
| brief line `intake-glob` (lib/guard-rules.mjs) | large Glob refused | refusal made warn-only by task 10 | drop (task 14) |
| brief line `live-shells` (lib/guard-rules.mjs) | final result after own shells end | no; spend refusal kept | keep |
| brief line `result-tools` (lib/guard-rules.mjs) | no Write tool, reply in text | no; security refusal kept | keep |
| brief line `task-owner` (lib/guard-rules.mjs) | TaskStop only own task | no; security refusal kept | keep |
| brief line `tool-case` (lib/guard-rules.mjs) | exact tool names | yes, tool errors are native, https://code.claude.com/docs/en/tools-reference | drop (task 13) |
| lead context hooks/dispatch-rules.md:1 | lead keeps decisions | yes, subagents own a context, https://code.claude.com/docs/en/sub-agents; session-rules T1 to T5 repeat it | drop (task 14) |
| lead context hooks/dispatch-rules.md:2 | brief with goal, pointers, stop | yes, the prompt is the subagent's context, https://code.claude.com/docs/en/sub-agents | drop (task 14) |
| lead context hooks/dispatch-rules.md:3 | lead reads no briefed file | no check backs it; on doubt | drop (task 14) |
| lead context hooks/dispatch-rules.md:4 | result file and return cap | no; spend, return cap in harnesses/coordination-contract.json | keep |
| lead context hooks/dispatch-rules.md:5 | long output to a log | partly, Bash output is cut natively; on doubt | drop (task 14) |
| lead context hooks/dispatch-rules.md:6 | no model or effort on exo agents | no; spend refusal kind-mismatch kept | keep |
| lead context hooks/dispatch-rules.md:7 | `exo-kind:` label choice | no; spend refusal kind-mismatch-label kept | keep |
| lead context hooks/dispatch-rules.md:8 | size briefs by Reads and Fetches | no; spend refusals brief-over-budget, brief-over-fetches kept | keep |
| lead context hooks/dispatch-rules.md:9 | Reads or Fetches line, no Result | its refusals warn after task 8 | drop (task 14) |
| lead context hooks/dispatch-rules.md:10 | phases and `Workers:` line | no; spend refusal workers-line kept | keep |
| lead context hooks/dispatch-rules.md:11 | end turn and wait for the notice | yes, background agents notify, https://code.claude.com/docs/en/sub-agents; live-shells line repeats it | drop (task 14) |
| lead context: the brief lines above | briefLines() after dispatch-rules.md | same rows as the brief lines | same decision per row |
| session hooks/session-routing.md:1 | invoke a matching skill first | yes, the Skill tool states it | keep, removal needs the paid routing benchmark |
| session hooks/session-routing.md:2 | a skill takes its part only | on doubt | keep, removal needs the paid routing benchmark |
| session hooks/session-routing.md:3 | when no skill applies | no; tests/routing-check.test.mjs reads it | keep |
| session hooks/session-routing.md:4 | known cause, one plain attempt | no; tests/routing-check.test.mjs reads it | keep |
| session hooks/session-routing.md:5 | unknown cause goes to find-cause | no; tests/routing-check.test.mjs reads it | keep |
| session hooks/session-routing.md:6 | CLAUDE.md outranks a skill | yes, CLAUDE.md is loaded as instructions, https://code.claude.com/docs/en/memory | keep, removal needs the paid routing benchmark |
| session hooks/session-rules.md:1 | prove a fix red first | no; last copy of the goal-driven rule, the land check only warns after task 6 | keep |
| session hooks/session-rules.md:2 to 5 | variants, fix all causes, count warnings, oracle on every row | quality advice, no delete, spend, network or security | drop (task 14) |
| session hooks/session-rules.md:6 | green as typed, no destructive unblock | no; delete | keep |
| session hooks/session-rules.md:7 | ask only about the destructive step | no; delete | keep |
| session hooks/session-rules.md:8 to 12 | default inline and T1 to T4 | no; spend, decides how many agents run, project CLAUDE.md names T1 to T5 | keep |
| session hooks/session-rules.md:13 | T5 background agent | yes, `run_in_background`, https://code.claude.com/docs/en/sub-agents | drop (task 14) |
| session hooks/session-rules.md:14 | progress file for resume | no; skills/build/references/run-loop.md does not state the progress-file rule | keep |
| session hooks/session-rules.md:15, 16 | check a running agent, resume an idle one | yes, task notifications, https://code.claude.com/docs/en/tools-reference | drop (task 14) |
| session hooks/session-rules.md:17 | TaskStop own shells before the report | no; spend, work running on | keep |
| session hooks/session-rules.md:18 | no final checks in a round brief | repeats brief lines `suite`, `watch`, `sleep` | drop (task 14) |
| session hooks/session-rules.md:19 | grep a large file in the lead | the Read tool caps output; result-line warns after task 10 | drop (task 14) |
| session hooks/session-rules.md:20, 21 | off-brief agent, safe default | advice, no delete, spend, network or security | drop (task 14) |
| session hooks/session-rules.md:22 | ask before an irreversible step | no; delete | keep |
| session settings and pointers line (skills/configure/scripts/settings.mjs) | effective settings and state pointers | no | keep, `env` leaves it in task 12 |
| brief checks | validate worker briefs | no | warn only (task 8) |
| agents in agents/ | dispatch definitions | subagents are the mechanism, https://code.claude.com/docs/en/sub-agents | keep |
| handoff stub and save-session | resume notes | /compact and auto memory differ | keep |
| loop budget and run outcomes | bound plan-loop rounds | no | keep |
| spec, build, gate, ship, watch, find-cause, write-docs, edit-skills, configure scripts | skill workflows | no | keep |
| hooks run-no-wait, run-stall-guard, run-watch | guard a run session | no | keep |
| lib helpers and plugin manifests | shared code | no | keep |

## Assumptions
- [assume] A3: the handoff Goal is filled from the `## Goal` section of the newest plan or progress file found by newestProgressFile, and the section is omitted when none exists; a regex inside hooks/session-end.mjs is used because plan-frame is not reachable from hooks and an import would add a module.
- [assume] A4: plan-check with `--loop` also runs the Success criterion command taken by criterionCommand and flags an exit 127 or a timeout; the static checks stay.
- [assume] A5: a worktree counts as landed when `git cherry HEAD <branch>` lists no `+` commit or the branch's combined patch-id matches a commit in HEAD history; current line counts no longer decide.
- [assume] B: a warning line is one stdout line with exit 0 in the form `[WARN] <reason>`; hard refusals stay for the classes in the table.
- [assume] C: the session-start settings line is generated from skills/configure/schema.json, so removing the schema entry removes the line; grep of hooks found no other use of `env`.
- [assume] D: the outside-Files and red-first warnings keep the principle visible without stopping work.
- [assume] The Claude Code docs were read only in part (hooks and subagent pages to about a third), so no row claims more than the cited page states.

## Manual checks
- Create a new worktree with a gitignored .env in the main checkout and look for the same .env in the worktree.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.claude/worktrees/lean-native-spec
Branch: spec/lean-native
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(lean): lean native
Lint: none
Allow: none

## Success criterion
`npm run check`
Red: none (each task's Proof proves its own red)

## Checkpoint
- Blocks first: Task 1, which owns the shared warn table, then Task 8.
- Parallel: Tasks 1 and 6.
- Shared state: lib/guard-rules.mjs and tests/guard-rules.test.mjs (Tasks 1, 8, 9, 10, 13, 14), verify/budgets.mjs (Tasks 1, 3, 5, 9, 10, 13, 14, 15), land-refusals.mjs (Tasks 6, 7), tests/checkout.test.mjs (Tasks 11, 12).
- Smallest safe split: one task per point.

## Tasks
### Task 1: feat(guards): one table decides warn or deny
Depends on: none | Files: `lib/guard-rules.mjs`, `lib/lazy-steps.mjs`, `lib/brief-denials.mjs`, `hooks/dispatch-bash.mjs`, `hooks/agent-effort.mjs`, `tests/guard-rules.test.mjs`, `verify/module-size-ceilings.txt`, `verify/budgets.mjs`, `tests/brief-denials.test.mjs`, `tests/dispatch-bash-alternatives.test.mjs`, `tests/dispatch-bash-long-rewrite.test.mjs`, `tests/dispatch-bash-ss-b.test.mjs`, `tests/dispatch-bash-ss-c.test.mjs`, `tests/dispatch-bash-ss-warn.test.mjs`, `tests/agent-effort.test.mjs`, `CONTRIBUTING.md`, `tests/hooks.test.mjs` | Data: a `warn` flag on each GUARD_RULES row read by guardKind | Proof: grep -q "one warn table" tests/guard-rules.test.mjs && node --test --test-timeout=60000 --test-name-pattern="one warn table" tests/guard-rules.test.mjs
### Task 2: feat(loop-budget): decide returns needs-input
Depends on: 1 | Files: `lib/loop-budget.mjs`, `tests/loop-budget.test.mjs`, `tests/loop-end-states.test.mjs`, `CONTRIBUTING.md` | Data: the ledger verdict string gains needs-input when a question is open | Proof: grep -q "decide needs-input" tests/loop-budget.test.mjs && node --test --test-timeout=60000 --test-name-pattern="decide needs-input" tests/loop-budget.test.mjs
### Task 3: feat(handoff): fill the Goal from the plan or progress file
Depends on: 2 | Files: `hooks/handoff-stub.md`, `hooks/session-end.mjs`, `tests/session-end.test.mjs`, `tests/handoff.test.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md` | Data: a Goal section string read from the newest progress file, omitted when absent | Proof: grep -q "stub goal from plan" tests/session-end.test.mjs && node --test --test-timeout=60000 --test-name-pattern="stub goal from plan" tests/session-end.test.mjs
### Task 4: feat(plan-check): run the Success criterion
Depends on: 3 | Files: `skills/spec/scripts/plan-check-loop.mjs`, `skills/spec/scripts/plan-check.mjs`, `tests/plan-check-run-commands.test.mjs`, `CONTRIBUTING.md` | Data: an exit code per criterion command | Proof: grep -q "criterion runs" tests/plan-check-run-commands.test.mjs && node --test --test-timeout=60000 --test-name-pattern="criterion runs" tests/plan-check-run-commands.test.mjs
### Task 5: fix(worktree): landed check uses patch equivalence
Depends on: 4 | Files: `lib/merge-state.mjs`, `skills/build/scripts/remove-worktree.mjs`, `tests/remove-worktree.test.mjs`, `tests/landed-removal.test.mjs`, `tests/squash-conflict.test.mjs`, `verify/budgets.mjs`, `verify/module-size-ceilings.txt` | Data: git cherry output over the worktree's commits | Risk: security boundary | Boundary: in a branch whose commits all match HEAD history | out a branch with an unlanded commit | test tests/landed-removal.test.mjs | Proof: grep -q "landed by patch id" tests/landed-removal.test.mjs && node --test --test-timeout=60000 --test-name-pattern="landed by patch id" tests/landed-removal.test.mjs
### Task 6: feat(land): outside Files and unseen red proof warn
Depends on: none | Files: `skills/build/scripts/land-refusals.mjs`, `skills/build/scripts/land-task.mjs`, `tests/land-task-commit.test.mjs`, `tests/land-refusal-kinds.test.mjs` | Data: refusal rows carry warn or hard | Proof: grep -q "outside files warns" tests/land-task-commit.test.mjs && node --test --test-timeout=60000 --test-name-pattern="outside files warns" tests/land-task-commit.test.mjs
### Task 7: feat(land): warn on a dropped boundary word without Drops
Depends on: 6 | Files: `skills/build/scripts/land-refusals.mjs`, `skills/build/scripts/land-commit-block.mjs`, `tests/land-task-commit.test.mjs` | Data: one warning line from the commit block | Proof: grep -q "boundary word warns" tests/land-task-commit.test.mjs && node --test --test-timeout=60000 --test-name-pattern="boundary word warns" tests/land-task-commit.test.mjs
### Task 8: feat(briefs): Fetches, Worktree and brief shape checks warn
Depends on: 5 | Files: `lib/brief-denials.mjs`, `lib/brief-path-rules.mjs`, `lib/brief-rules.mjs`, `hooks/agent-effort.mjs`, `lib/guard-rules.mjs`, `tests/brief-denials.test.mjs`, `tests/agent-effort.test.mjs`, `tests/brief-rules-align.test.mjs`, `tests/fixtures/refusals/briefs.json`, `tests/guard-rules.test.mjs`, `tests/hook-refusal.test.mjs`, `CONTRIBUTING.md`, `verify/module-size-ceilings.txt`, `lib/research-route.mjs`, `tests/brief-result-tools.test.mjs`, `tests/page-cut-denial.test.mjs` | Data: the warn flag on the brief-unresolved, brief-worktree, brief-lacks-fetches, brief-invalid, brief-lacks-fields, brief-reads-label and brief-cuts-page rows | Proof: grep -q "brief without fetches still dispatches" tests/agent-effort.test.mjs && node --test --test-timeout=60000 --test-name-pattern="brief without fetches still dispatches" tests/agent-effort.test.mjs
### Task 9: feat(guards): code rules on Edit and Write warn
Depends on: 8 | Files: `hooks/dispatch-edit.mjs`, `lib/guard-rules.mjs`, `tests/guard-rules.test.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md`, `verify/module-size-ceilings.txt`, `lib/edit-code-rules.mjs`, `tests/edit-code-rules.test.mjs` | Data: the code-rules row flagged warn | Proof: grep -q "code rules warn" tests/guard-rules.test.mjs && node --test --test-timeout=60000 --test-name-pattern="code rules warn" tests/guard-rules.test.mjs
### Task 10: feat(guards): context-target, Read line cap and Glob size warn
Depends on: 9 | Files: `lib/guard-rules.mjs`, `lib/context-decisions.mjs`, `hooks/context-limit.mjs`, `tests/guard-rules.test.mjs`, `tests/context-limit.test.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md`, `verify/module-size-ceilings.txt`, `docs/principles/context.md`, `docs/principles/harness.md`, `tests/intake-bound.test.mjs` | Data: the context-target, result-line and intake-glob rows flagged warn, and only the sentences docs/principles/context.md:12 and docs/principles/harness.md:9 that prefer a reset to compaction, reworded so none states the opposite of auto compaction covering the context target | Proof: grep -q "context target warns" tests/context-limit.test.mjs && node --test --test-timeout=60000 --test-name-pattern="context target warns" tests/context-limit.test.mjs
### Task 11: feat(checkout): always copy .env into new worktrees
Depends on: 10 | Files: `lib/checkout.mjs`, `tests/checkout.test.mjs`, `CONTRIBUTING.md` | Data: the gitignored .env files copied at worktree creation | Risk: security boundary | Boundary: in a gitignored .env file | out a tracked .env file in a commit | test tests/checkout.test.mjs | Proof: grep -q "copies env without setting" tests/checkout.test.mjs && node --test --test-timeout=60000 --test-name-pattern="copies env without setting" tests/checkout.test.mjs
### Task 12: feat(configure): remove the env setting
Depends on: 11 | Drops: not in skills/spec/references/hand-off.md, never in skills/spec/references/hand-off.md, each in skills/spec/references/hand-off.md | Files: `skills/configure/schema.json`, `skills/configure/scripts/settings.mjs`, `docs/settings.md`, `skills/spec/references/hand-off.md`, `tests/checkout.test.mjs`, `tests/settings-fail-soft.test.mjs`, `CONTRIBUTING.md`, `verify/module-size-ceilings.txt`, `tests/shipping-stack.test.mjs`, `.claude-plugin/plugin.json`, `skills/configure/SKILL.md`, `verify/rule-removals.txt` | Data: the settings schema without the env key | Evidence: none (a setting is removed, no wording is tuned) | Proof: grep -q "env setting removed" tests/checkout.test.mjs && node --test --test-timeout=60000 --test-name-pattern="env setting removed" tests/checkout.test.mjs
### Task 13: feat(guards): drop the tool-case rule
Depends on: 12 | Files: `lib/guard-rules.mjs`, `tests/guard-rules.test.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md`, `verify/module-size-ceilings.txt` | Data: GUARD_RULES without the tool-case row | Proof: grep -q "no tool-case rule" tests/guard-rules.test.mjs && node --test --test-timeout=60000 --test-name-pattern="no tool-case rule" tests/guard-rules.test.mjs
### Task 14: feat(guards): drop injected lines Claude Code covers
Depends on: 13 | Drops: only in hooks/dispatch-rules.md, no in hooks/dispatch-rules.md, never in hooks/dispatch-rules.md, unless in hooks/dispatch-rules.md, only in hooks/session-routing.md, only in hooks/session-rules.md, not in hooks/session-rules.md, no in hooks/session-rules.md, never in hooks/session-rules.md, every in hooks/session-rules.md, each in hooks/session-rules.md, all in hooks/session-rules.md, full in hooks/session-rules.md | Files: `lib/speed-rules.mjs`, `lib/guard-rules.mjs`, `hooks/dispatch-rules.md`, `hooks/session-rules.md`, `hooks/session-routing.md`, `tests/guard-rules.test.mjs`, `tests/agent-effort.test.mjs`, `tests/hooks.test.mjs`, `tests/worker-waits.test.mjs`, `tests/codex-brief-rules.test.mjs`, `tests/routing-check.test.mjs`, `tests/session-start.test.mjs`, `tests/routing-eval.test.mjs`, `tests/session-start-codex.test.mjs`, `tests/session-start-source.test.mjs`, `verify/budgets.mjs`, `verify/module-size-ceilings.txt`, `CONTRIBUTING.md` | Data: the `brief` field of each GUARD_RULES row and the lines of the three hook text files, each set to the part D decisions, with INJECTED_CONTEXT_LOCK, SESSION_LOAD_LOCK and SESSION_START_BYTES_LOCK lowered and a BRIEF_LINES_LOCK bytes bound added for briefLines() | Evidence: none (lines are removed, no wording is tuned) | Proof: grep -q "injected text drops native lines" tests/guard-rules.test.mjs && node --test --test-timeout=60000 --test-name-pattern="injected text drops native lines" tests/guard-rules.test.mjs
### Task 15: docs(lean): add the push-back, anti-bloat and trivial-task rules
Depends on: 14 | Files: `lib/references/lean.md`, `docs/principles/prompt.md`, `tests/lean-principles.test.mjs`, `verify/checks/reference-shape.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md` | Data: three lines in lean.md (say so when a simpler approach exists; no abstraction for single-use code and no handling of impossible cases; for a trivial task scale these checks down), the Karpathy source dated 2026-01-26 with https://x.com/karpathy/status/2015883857489522876, LEAN_REFERENCE_LOCK bytes raised to the new size | Proof: grep -q "lean push-back lines" tests/lean-principles.test.mjs && node --test --test-timeout=60000 --test-name-pattern="lean push-back lines" tests/lean-principles.test.mjs
### Task 16: feat(plan-check): size and shape flags warn and never stop a build
Depends on: 15 | Files: `skills/spec/scripts/plan-check.mjs`, `skills/spec/scripts/plan-check-size.mjs`, `skills/spec/scripts/plan-check-files.mjs`, `tests/plan-check-warn.test.mjs`, `tests/plan-check-corpus.test.mjs`, `tests/plan-check-headroom.test.mjs`, `tests/plan-check-literals.test.mjs`, `tests/plan-check-proof-runs.test.mjs`, `tests/plan-template.test.mjs`, `tests/start-run.test.mjs`, `tests/fixtures/plans/bad/acceptance-item-without-citation.md`, `tests/fixtures/plans/bad/data-literal-absolute-path.md`, `tests/fixtures/plans/bad/existing-test-unlisted.md`, `tests/fixtures/plans/bad/independent-tasks-without-worktree-setup.md`, `tests/fixtures/plans/bad/lock-doc-unlisted.md`, `tests/fixtures/plans/bad/open-point-unanswered.md`, `tests/fixtures/plans/bad/parallel-line-unreadable.md`, `tests/fixtures/plans/bad/parallel-tasks-share-a-file.md`, `tests/fixtures/plans/bad/proof-diffs-bare-default-branch.md`, `tests/fixtures/plans/bad/proof-equals-land-gate.md`, `tests/fixtures/plans/bad/proof-test-unlisted.md`, `tests/fixtures/plans/bad/refactor-without-red.md`, `tests/fixtures/plans/bad/test-only-files-without-red.md`, `CONTRIBUTING.md`, `verify/module-size-ceilings.txt`, `verify/budgets.mjs` | Data: one PLAN_CHECKS table in plan-check.mjs, each row a check function with `warn: true` or hard per the part B plan-check rows; planCheckReport sets ok from hard rows only and prints each warn flag as one `[WARN] <reason>` line, the `warning: ` prefix of the existing warnings becomes `[WARN] `, the split-Task warning keeps its measured tokens and limit, and a fixture whose flag now warns heads `<!-- expect: [WARN] <line> -->`, read by the corpus test as exit 0 with that line printed; the test also shows a Proof command not on PATH still exits 1 | Proof: grep -q "oversized task warns" tests/plan-check-warn.test.mjs && node --test --test-timeout=60000 --test-name-pattern="oversized task warns" tests/plan-check-warn.test.mjs
### Task 17: feat(guards): commit message shape checks warn
Depends on: 16 | Files: `lib/evidence-rules.mjs`, `lib/commit-messages.mjs`, `lib/lazy-steps.mjs`, `tests/guard-rules.test.mjs`, `tests/fixtures/refusals/commits.json`, `CONTRIBUTING.md` | Data: the commit-evidence row of EVIDENCE_RULES flagged `warn: true` and read by guardKind, so a `git commit` with a bad `Evidence:` line runs with one `[WARN]` line; commit-attribution and the .env and secret refusals stay hard | Proof: grep -q "evidence line warns" tests/guard-rules.test.mjs && node --test --test-timeout=60000 --test-name-pattern="evidence line warns" tests/guard-rules.test.mjs
