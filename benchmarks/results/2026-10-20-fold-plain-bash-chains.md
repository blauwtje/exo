# Fold plain-Bash phase chains into exo script output

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s6/`.


Verdict: FAIL at the $0 step (quality guard: scriptability 0/20). No paid run, no branch. Spent: $0.00.
Prereg: r2-test-G1-prereg.md (unchanged). Scripts: tests/g1/chains.mjs (extract; `node chains.mjs other|exorepo|sweep
[--reset-human]`, writes runs-*.json), tests/g1/analyze.mjs (phase x class table, fold replay, bootstrap),
tests/g1/script.mjs (seeded 20-chain scriptability sample).

## Primary: other projects, 261 runs, $3.67/run
- Plain-Bash-triggered lead requests: 21.64% of run (matches r2-L6's 21.7%).
- Foldable chains (>= 3 same-class requests, one turn, exo phase), cost and raw fold saving, % of run:

| class | chain cost | raw fold saving |
|---|---|---|
| read (cat/sed/grep/head/ls...) | 4.04 | 2.73 |
| other | 1.00 | 0.70 |
| git-inspect | 0.25 | 0.16 |
| gh | 0.24 | 0.16 |
| git-write / test-check / git-housekeeping | 0.03 / 0.03 / 0.01 | 0.02 / 0.02 / 0.01 |

- Selected class `read`: threshold 1 passes (4.04% >= 3%); raw saving 2.73%, 95% bootstrap CI 2.23..3.45 (fixed and
  reselected class identical).
- By phase (read, chain cost): spec 1.13, build 1.02, design-ui 0.73, find-cause 0.44, verify 0.38, ship 0.27.
- Quality guard (scriptability): 0 of 20 sampled read chains match a normalized command template seen in >= 5 runs;
  0 of all 232 read chains do. Most templates occur in 1 run. The sample shows ad hoc code investigation (grep for a
  symbol, then `sed -n <range>` of the hit, then another file): each command depends on the previous result, so no
  existing exo script can run it ahead of time.
- Threshold 2 (saving x scriptable fraction >= 1.5%): 2.73 x 0/20 = 0. FAIL.

## Sensitivity (reported only, not used for the verdict)
- Phase reset on human prompt: read chains 2.92% cost, saving 1.99% (CI 1.52..2.59). Still unscriptable.
- Exo repo (1339 runs): read saving 0.67% (CI 0.54..0.84). Sweep (510 runs): largest class `other` 0.37%.
- Read chains whose every command targets an exo artifact (`.exo/`, plan or spec files, `.log`, branch review):
  22 of 232 chains, saving 0.11% of run. With at least one such command: 1.38% (upper bound; the other reads in those
  chains are still code reads).
- The housekeeping chains the idea named (post-run git/worktree cleanup, check logs, git log/diff before verify or
  ship) are small: git-housekeeping 0.01%, git-inspect 0.16%, test-check 0.02% of run in chains of 3+.

## Why it fails
- The 21.7% plain-Bash bucket is mostly the lead reading code with shell tools while it reasons (spec, build, design-ui,
  find-cause). Those chains are exploratory: the next command depends on the last result, so a phase script cannot
  print them. The recipe-like chains (git housekeeping, log reads, exo artifact reads) that a script could fold hold
  about 0.1-0.3% of run, far under the 1.5% bar.
- What remains is a different idea (move exploratory code reading off the Opus lead, for example to `exo:locate-code`
  or a Sonnet helper; L6.1's second route). That changes who reads, not script output, so it needs its own test and a
  quality guard on decisions; this test does not cover it.

## Caveats
- Command class is by regex on the first matching tool; `read` includes `cd x && ...` reads. Parallel Bash with mixed
  classes was excluded from chains (it was ~0% of cost here).
- The template rule is strict, but the verdict does not hinge on it: the artifact-target sensitivity (0.11%) and the
  housekeeping classes (<= 0.16%) show no recipe-like class near the bar under any reading.
