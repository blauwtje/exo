# draft-plan: pass criteria for the `with` arm

`a-ledger.txt` asks for a seven-phase plan over the `setup.sh` fixture. The case is run twice with `with` arms: once on a clone before the phase delegation in `skills/draft-plan/SKILL.md` ## Investigate, once on a clone after it.

- The main session's context stays under 100k tokens: the largest `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` of any main-thread assistant turn in the run's transcript, read from `~/.claude/projects/<scratch dir>/<session>.jsonl`, excluding the lines under `subagents/`.
- `docs/plans/multi-currency.md` exists in the fixture and holds a `### Phase <n>` heading for each of the seven phases, each followed by at least one `### Task <n>`.
- The session dispatches one delegate per phase, one after another, each after the previous one returned. (derived from SKILL.md)
