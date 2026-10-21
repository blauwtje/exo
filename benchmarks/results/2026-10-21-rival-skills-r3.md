# exo against a rival skills plugin: 8 tasks, 40 pairs

Paired run of `exo` against `skills-rival` on the eight tasks `value-export-mismatch`, `value-test-pollution`, `value-context-guards`, `value-add-field-migration`, `value-destructive-safe`, `value-lean-minimal-diff`, `value-find-cause-decoy` and `value-commit-hygiene` (fixtures in `benchmarks/value/`). Sonnet 5.5 (`claude-sonnet-5-5`), Claude Code 2.1.306, 5 runs per task and arm, 80 cells, 2026-10-21. Arm `pb-full-R3`: exo with the edit-impact note (`lib/edit-impact.mjs`), the delete-would-unblock rule reworded in `hooks/session-rules.md`, and two Stop gates (named suspect, offered-but-unmade) that did not fire in this run. Score is `1 - defects/total` per cell, from `node benchmarks/score.mjs`. The tasks were also used while tuning exo, so this is not a held-out set.

## Run health

80 of 80 cells ran, 0 skipped, $9.979 spent of a $20 cap. `score.mjs` shows 0 errors for every task and arm. Every `result.json` has `stop_reason` end_turn and `is_error` false, none timed out, every `stderr.log` is empty. exo loaded in the 40 exo cells and in none of the rival cells.

## Pass rule

| check | value | verdict |
|---|---|---|
| Q1 sign test, exo above rival, 40 pairs | 9 wins, 0 losses, 31 ties; exact one-sided p = 0.00195 (n = 9 not tied) | pass |
| Q2 hidden passes | exo 36/40, rival 28/40 | pass |
| C1 mean cost per cell | exo $0.1132, rival $0.1364; mean paired difference -$0.0232, one-sided 95% upper bound -$0.0160, limit +$0.0136 (10% of the rival mean) | pass |

Score sums are 37.73 for exo and 34.69 for the rival. exo was cheaper in all 8 tasks; the closest is `value-add-field-migration` at $0.217 against $0.229.

## Per task

| task | wins | losses | ties | hidden pass exo / rival |
|---|---|---|---|---|
| value-export-mismatch | 1 | 0 | 4 | 5 / 4 |
| value-test-pollution | 2 | 0 | 3 | 1 / 0 |
| value-context-guards | 0 | 0 | 5 | 5 / 5 |
| value-add-field-migration | 0 | 0 | 5 | 5 / 5 |
| value-destructive-safe | 5 | 0 | 0 | 5 / 0 |
| value-lean-minimal-diff | 1 | 0 | 4 | 5 / 4 |
| value-find-cause-decoy | 0 | 0 | 5 | 5 / 5 |
| value-commit-hygiene | 0 | 0 | 5 | 5 / 5 |
| **total** | **9** | **0** | **31** | **36 / 28** |

No pair was lost (0 of 40).

## Where the wins came from

- `value-destructive-safe`, runs 1-5: the rival left `npm test` red (7 failing) in each and scored 1/4 defects; exo scored 0/4 in all five.
- `value-export-mismatch`, run 2: the rival had 4/9 defects, with 10 customers' totals wrong against the dashboard.
- `value-test-pollution`, run 1: exo 4/15 defects, rival 10/15, both failing. Run 5: exo 0/15 pass after touching 7 files, rival 10/15. Runs 2-4 tie at 10/15.
- `value-lean-minimal-diff`, run 1: the rival had 4/14 defects, three hidden formula-neutralisation tests failed and it did not reuse the existing export helper.

## Gates

Each exo cell has exactly one `stop_hook_summary` in its transcript and the rival cells have none. `preventedContinuation` is true in 0 of 80 cells and no transcript holds a gate reason text, so neither Stop gate fired. The gain comes from the prompt rules and the edit-impact note, not from a gate.
