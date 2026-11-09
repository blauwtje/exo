# Review recall: keep a fix finding whose sweep hits a sibling site (2026-11-09)

Branch `fix/review-recall`, commit 1a916efb. Before it, `sweepInvalid` in `skills/gate/scripts/merge-reviews.mjs` demoted a `fix` finding to `report` whenever its Sweep hit more than the quoted line, so a real defect with a sibling site was never repaired. After it, a finding is demoted only when no sweep hit ends with its Quote.

Harness: `node benchmarks/review-replay.mjs --full --rounds 3 --repeat 1`, one invocation per fixture and repeat, base `.worktrees/recall-base` (72913a96) against fix (1a916efb), interleaved, n=2 per fixture and arm. Runs: `benchmarks/runs/2026-11-09-review-recall-{base,fix}` (gitignored). Total spend 5.52 USD.

## Thresholds

- incomplete-fix fixed in every fix run.
- Planted fixtures fixed by fix at least as often as by base.
- Findings on `clean` not above base.

## Results

| fixture | base fixed (r0 / r1) | fix fixed (r0 / r1) | base rounds | fix rounds |
|---|---|---|---|---|
| incomplete-fix | no repair / no repair | 1 / 1 | 1 / 1 | 2 / 2 |
| duplicate-truth-source | no repair / 0.33 | 1 / 1 | 1 / 2 | 2 / 2 |
| swallowed-failure | 0.67 / 1 | 1 / 0.67 | 2 / 2 | 3 / never clean |
| clean (no plant) | n/a | n/a | 1 / 1 | 1 / 1 |

- incomplete-fix: base 0/2, fix 2/2.
- Planted fixed share, 6 runs per arm: base mean 0.333, fix mean 0.944.
- clean: both arms clean in round 1 in 2/2 runs, no findings.
- False fix lines: 0 in every run of both arms.
- Cost per run: base 0.270 USD, fix 0.420 USD, because real defects now get repair rounds.
- swallowed-failure fix r1 stayed open after 3 rounds (0.67 fixed); base reached clean in 2 rounds on both runs.

## Verdict

Keep. All three thresholds hold. The higher cost and rounds come from repairs that base skipped by demoting real findings.
