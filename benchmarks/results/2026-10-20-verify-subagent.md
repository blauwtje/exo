# Verify in a fresh subagent

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s6/`.

Script: .exo/self-improve/s6/tests/f2.mjs (one run per setting, prereg r1-test-F2-prereg.md unchanged).
Corpus: 93 real-use runs with a lead verify window (21.1 lead requests per window), actual verify-window lead cost $54.46 of $386.67 run cost.

## Primary (FRESH=12k, subagent writes at 5m, expiry rewrite when gap > 300 s, 2 extra lead turns, ship-side gain not credited)
- Counterfactual verify cost $48.92. Saving $5.54.
- (a) share of targeted bucket (lead verify window): 10.17%, 95% CI [4.52, 15.33] -> passes the 3% bar.
- (b) share of run cost: 1.43%, 95% CI [0.63, 2.23] -> point estimate is BELOW the 1.5% bar. Prereg threshold 1 fails.

## Sensitivity (cannot flip the verdict, per prereg)
| setting | (a) % bucket [CI] | (b) % run [CI] |
| FRESH 8k | 17.32 [12.20, 22.12] | 2.44 [1.65, 3.26] |
| FRESH 12k (primary) | 10.17 [4.52, 15.33] | 1.43 [0.63, 2.23] |
| FRESH 20k | -4.13 [-10.95, 1.94] | -0.58 [-1.53, 0.28] |
| FRESH 12k, subagent with 1h cache (run-unit style `cacheTtl: 1h`, no expiry) | 10.85 [7.24, 14.48] | 1.53 [0.96, 2.13] |
Corpus fact: subagent writes are 99% 5m (66.3M 5m vs 0.95M 1h tokens), so the 5m price plus the >300 s expiry is the honest default; the review-branch wait is what triggers expiry.

## Reading
- The gain sits right on the bar and flips sign between FRESH 8k and 20k. A general-purpose subagent carries its own system prompt, tool list and the verify skill body, so 12k is plausible but unmeasured here; the idea has no margin.
- Reaching 1.53% needs the subagent on a 1h cache, but no existing agent fits: run-unit has `cacheTtl: 1h` but tools Read, Bash, Agent, SendMessage (no Skill, no Write), so it cannot run `exo:verify`; a new agent type would be needed, which CLAUDE.md forbids without a recorded failure.
- G1 (mid-verify user turn): my detector counted 59/93 windows, but most are Stop-hook feedback, local commands (/copy, /reload-plugins) and windows running to session end; it is too noisy to rule on. Real user replies ("1", "status?", a recommendation request) do occur, and a subagent cannot ask the user (verify's no-plan ask and the codex offer), so a relay design would add lead turns not priced here.
- G2 (verdict match) not measurable offline. Not needed since the cost bar fails.

## Paid design (not run; would only matter if the bar were met)
flow-unit lacks a ~50k spec preamble, so both arms need a prefilled 50k conversation, n=5 per arm, verify stage only, about $8. Not justified: expected effect 1.4% of run is below what n=5 can resolve.

Verdict: FAIL. No branch, no worktree.
