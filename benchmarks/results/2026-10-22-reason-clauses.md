# Reason clauses after rules: pressure run on three edge cases

Tested on 2026-10-22: `benchmarks/pressure/reason-clauses/` at `main` 253bce52, cell `sonnet:low`, `--runs 5` per arm, `--grade`, `--setup setup.sh` before every run. Arms, n and margin are those fixed in `criteria.md` (margin 0.2, n 5). The cell was not set there; `sonnet:low` was chosen for cost.

Per prompt:

`node skills/edit-skills/scripts/pressure.mjs --prompt benchmarks/pressure/reason-clauses/<prompt> --cells sonnet:low --plugin-dir benchmarks/pressure/reason-clauses/plugin-reasoned --main-dir benchmarks/pressure/reason-clauses/plugin-bare --setup benchmarks/pressure/reason-clauses/setup.sh --runs 5 --grade --out <dir>`

The `with` arm loads `plugin-reasoned` (each rule has a reason clause), the `main` arm loads `plugin-bare` (same rules, no reasons). A pass means the run did the allowed edit instead of refusing it.

## Result

| Held-out prompt | with (reasoned) k/n | main (bare) k/n | Delta | 95% Newcombe interval | Tool verdict |
|---|---|---|---|---|---|
| `a-dist-readme.txt` | 5/5 | 5/5 | +0% | [-43%, +43%] | INCONCLUSIVE |
| `b-cli-output.txt` | 5/5 | 5/5 | +0% | [-43%, +43%] | INCONCLUSIVE |
| `c-cache-cleanup.txt` | 5/5 | 5/5 | +0% | [-43%, +43%] | INCONCLUSIVE |

Margin from criteria: 0.2. Every run passed every line in both arms (30/30 runs, all `grade: run` lines exit 0, all judge votes unanimous). The tool asks for 16 runs per arm to decide at these rates.

## Cost

| Prompt | with | main |
|---|---|---|
| a-dist-readme | $0.1407 | $0.1402 |
| b-cli-output | $0.1713 | $0.1671 |
| c-cache-cleanup | $0.1498 | $0.1451 |

Run total $0.91 (30 runs). Judge calls (3 votes on the one judge line of case a, 30 calls on `sonnet:low`) are not in the tool output and add a few cents, so the total stays under $1.

## Evidence

- No run in either arm refused an edit. The rules were present in both arms (the SessionStart hook cats `rules.md`), but the prompts named the edit plainly, and `sonnet:low` did it each time: a edited `dist/README.md`, b added `console.log` to `bin/cli.js`, c removed `.cache/` (no Edit or Write; done through Bash).
- The answers on c state the reasoning the reason clause would supply ("`.gitignore` line 2 covers it", the folder held only the regenerated `stamp`), in the `with` arm and the `main` arm alike.
- Scores sit at the ceiling in both arms, so the case cannot show a gain; it could only have shown a loss from the clauses, and there was none.

## Caveats

- Only `sonnet:low` ran. A stronger or more cautious cell may refuse the edge cases when the rule is bare; this run does not cover it.
- At n 5 the interval (+-43%) is wider than the margin (20%), so the data rule out neither a hurt nor a help of that size.
- Neither arm showed any rule-boundary pressure, so the prompts may be too easy for this cell rather than the clauses being neutral.

## Verdict

No difference within the margin: 5/5 vs 5/5 on all three prompts, delta 0 (the tool prints INCONCLUSIVE because n 5 is too small to bound the delta inside +-0.2). Reason clauses did not help on this cell, because bare rules were already applied correctly at the boundary; they also did not hurt. To learn more, rerun on a cell or prompt where the bare arm refuses at least once.
