# Build-task tier leak

Tested on 2026-10-20 as a $0 offline scan of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s7/` (prereg r4-test-I1-prereg.md, scripts tests/I1/scan.mjs and repro-l6.mjs).

## Result: FAIL, the premise was a counting artifact
- The claim to test: 211 of 222 non-exo build-tasks ran on Opus, $37.5 = 9.2% of window run cost, so the tier table did not reach the agent.
- Cause of the count: since Claude Code 2.1.30x every subagent transcript starts with an `api-request-shape` line whose tool list declares the advisor tool as `{"type":"advisor_20260301","name":"advisor","model":"claude-opus-5-5"}`. A grep for the first `"model":"claude-..."` string matches that declaration, not the billed model. The advisor was never called (0 advisor `server_tool_use` blocks), so it billed no Opus.
- Proof (repro-l6.mjs, non-exo build-tasks): naive Opus / billed Sonnet 210, naive Opus / billed Opus 4, naive Sonnet / billed Sonnet 11, which gives 214 "Opus" of 225 and matches the 211 of 222. Billed: 221 Sonnet, 4 Opus.
- Since the hook landed (fdfa6914, 2026-10-13) the hook model equals the billed model for all 916 exo agents scanned. No `CLAUDE_CODE_SUBAGENT_MODEL` override shows anywhere.
- Side table: the exo-repo review split (193 Sonnet, 52 Opus) is a time effect, since 191 of the Sonnet reviews predate 2026-10-13 when no model was set.

## The real leak
- 4 Opus build-tasks, all in one session (airpods-fix 4000efc6, 2026-10-19, Tasks 10 and 12), $2.35 = 5.7% of non-exo build-task spend ($40.9, 225 agents).
- Mechanism: `skills/build/references/run-loop.md` line 19 puts `exo:solve-hard: model opus, effort high.` in the `run-unit` brief. The Sonnet `run-unit` applied it to `exo:build-task`. `hooks/agent-effort.mjs` `filled()` keeps a dispatch's named model (`input.model ?? kind.model`, CONTRIBUTING.md line 70), and `agents/run-unit.md` never says which dispatches may name a model.
- Bucket 4 agents in 1 session; the bootstrap needs at least 8 sessions, so no CI. At the earlier -25% per-agent ratio the saving is about $0.6, under the $1.1 bar even as a point estimate. Quality guard not reached.

## Verdict
FAIL, reject. $0 spent, no branch. Suggested fix, not built: one line in `agents/run-unit.md` that passes `model` or `effort` only to `exo:solve-hard`, or have `agent-effort.mjs` drop a dispatch `model` on `exo:build-task`. It is a correctness fix worth about $0.6 per affected run, not a speed pass.

Future scans of the model mix must read the billed model from assistant `message.model` and skip `api-request-shape` lines.
