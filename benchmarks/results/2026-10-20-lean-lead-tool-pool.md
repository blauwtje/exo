# Lean lead tool pool through a plugin agent

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s7/`.

A plugin `agent` setting would make an `exo-lead` agent the main thread with a `tools:` allowlist, dropping schemas of tools the lead never calls. Prereg r3-test-H4-prereg.md (written before any number). Script tests/H4/h4.mjs.

Data: `api-request-shape` entries in Claude Code 2.1.300 or later transcripts (they record the system prompt and the non-deferred tools). Leads are top-level sessions after 2026-10-09 with an `exo:*` subagent. Verdict set: non-sweep, non-exo-repo, 3.5 characters per token, n = 21 leads (20 needed).

Removable set: tools in the lead's schema block outside {Read, Edit, Write, Bash, Agent, SendMessage, Skill, Grep, Glob} plus tools called by at least 5% of leads (AskUserQuestion, ToolSearch, TaskStop). That leaves ListAgents, ReportFindings, ScheduleWakeup, DeferredToolPlaceholder and advisor, present in all 21 leads.

| measure | primary 3.5 (verdict) | primary 2.17 | all incl. exo repo 3.5 (n=75) | sweep 3.5 (n=167, support only) |
|---|---|---|---|---|
| removable tokens per lead | 2,383 | 3,844 | 2,383 | 4,262 |
| all schema tokens per lead | 7,798 | 12,577 | 7,629 | 8,267 |
| removable share of average lead context (gate 1, at least 8%) | 3.6% [3.4, 3.9] | 5.8% [5.4, 6.3] | 3.4% [3.3, 3.6] | 14.7% |
| saving / lead cache bucket (gate 2, at least 3%) | 3.12% [2.87, 3.43] | 5.03% [4.63, 5.53] | 2.94% [2.75, 3.13] | 15.8% |
| saving / run cost | 0.67% [0.53, 0.88] | 1.08% [0.85, 1.42] | 0.71% [0.61, 0.84] | 3.7% |
| leads calling a removable tool (guard under 10%) | 9.5% (2 of 21) | same | 10.7% | 1.8% |

Bootstrap 2000 resamples over leads, 95%. Average lead context 66.1k tokens.

Gate 1 fails in both token conventions (3.6% and 5.8% against 8%). Gate 2 reaches 3.1% of the lead cache bucket only because that bucket is narrow; it is 0.67% of run cost (about 1.1% at 2.17 characters per token), and the lower bound 2.87% is under 3% anyway. The guard passes only marginally. Sweep leads show 14.7% only because their contexts are small (29k) and not real use.

Why it stays small: the harness already defers most tools (names only), so the schema block is about 7.8k tokens; the removable tools are five small schemas; and the agent main thread is opt-in, which would cut adoption further.

Limits: token counts are characters divided by a fixed ratio, not a tokenizer (both conventions fail gate 1); n = 21 is barely over the minimum; compaction, tool-search re-adds and the system-prompt replacement of an agent main thread are ignored per prereg.

Verdict: FAIL, reject. $0 spent, no branch. Ledger suggestion: `lean-lead-tool-pool-through-a-plugin-agent` rej, removable schemas 3.6% of lead context (bar 8%), 0.67% of run.
