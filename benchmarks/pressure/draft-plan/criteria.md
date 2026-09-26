# draft-plan: pass criteria for the `with` arm

`a-ledger.txt` asks for a seven-phase plan over the `setup.sh` fixture. The case is run twice with `with` arms: once on a clone before the phase delegation in `skills/draft-plan/SKILL.md` ## Investigate, once on a clone after it.

- The main session's context stays under 100k tokens: the largest `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` of any main-thread assistant turn in the run's transcript, read from `~/.claude/projects/<scratch dir>/<session>.jsonl`, excluding the lines under `subagents/`.
- `docs/plans/multi-currency.md` exists in the fixture and holds a `### Phase <n>` heading for each of the seven phases, each followed by at least one `### Task <n>`.
- The session dispatches one delegate per phase, one after another, each after the previous one returned. (derived from SKILL.md)

## b-run-small.txt

`b-run-small.txt` runs `/exo:draft-plan ... --run` on the same fixture for a two-phase, three-task change and proves the run goes from planning through both phases in one session. Read the fixture with `git -C /tmp/exo-pressure/draft-plan/ledger log --format='%h %s%n%(trailers:key=Plan-task)' feat/close-account` and the run's transcript with grep or jq.

- `docs/plans/close-account.md` exists, and its `## Goal` holds `Phase 1: docs/plans/close-account.md` and `Phase 2: docs/plans/close-account-2.md`; `docs/plans/close-account-2.md` exists and its `## Goal` holds `Phases: docs/plans/close-account.md`. (`references/plan-spec.md` rule 5)
- Branch `feat/close-account` holds three commits with a `Plan-task:` trailer, one per task, and both phase 1 commits come before the phase 2 commit.
- The transcript holds no user turn after the first prompt: every later `user` entry is a tool result or a harness message.
- The session does not stop between phase 1 and phase 2: one `result` event ends the run, and no Stop-hook continuation sits between the last phase 1 commit and the first phase 2 dispatch. (`run-plan` step 3, `Next phase:`)
- The tail runs once, after the phase 2 commit: one `exo:review-branch` or `exo:review-branch-deep` dispatch and one run of the plan's success-criterion command after it, none after phase 1. (`run-plan` step 7)
