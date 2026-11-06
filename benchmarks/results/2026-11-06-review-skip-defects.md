# Review-skip defects, 2026-11-06

A planted fixture (`tests/fixtures/review-skip-defects`) holds 3 defects in `src/parse-config.mjs`. The table shows which are caught by the gate's scripted code-rules scan before and after this change, and which the branch review catches. n=1 fixture, deterministic scan.

| Defect | Caught by checks before | Caught by checks after | Caught by review |
|---|---|---|---|
| Swallowed `catch {}` (line 14) | yes | yes | yes |
| Duplicate literal `8080` (lines 1 and 3) | no | yes | yes |
| Unused export `legacyPort` (line 21) | no | yes | yes |
| Total | 1 of 3 | 3 of 3 | 3 of 3 |

Skip path: step 2 of `skills/gate/SKILL.md` now skips only the `exo:review-branch` dispatch when the reviewer is `none`, so the merge still sends the `CODE-RULES` findings to the fix step.

Reproduce: build the fixture repo with a plain `git init` copy of the fixture under a scratch folder such as `~/scratch/rsd-probe`, then call `codeRuleFindings` and `codeRuleConcerns` from `lib/code-rules.mjs` with `paths: ['src/parse-config.mjs']`.
