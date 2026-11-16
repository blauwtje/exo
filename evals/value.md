# Value

One row per part: the cases it is measured by, its share of the 40 USD budget (cases times 1.90 USD), the order of the runs, the files only it uses, and the figures of `node evals/value.mjs --run` once measured: cases passed with and without exo, cost with and without, and date. The table is evidence, not a removal list.

| part | cases | share | order | paths | with | without | cost with | cost without | date |
|---|---|---|---|---|---|---|---|---|---|
| adhd | adhd-short-reply | 1.9 | 1 | output-styles/adhd.md | void | void | 0.38 | 0.39 | 2026-11-14 |
| build | build-red-suite | 1.9 | 2 | skills/build | 0 | 1 | 1.01 | 0.68 | 2026-11-14 |
| diagnose | diagnose-repatch | 1.9 | 3 | skills/diagnose | 0 | 1 | 1.01 | 0.88 | 2026-11-14 |
| document | route-document | 1.9 | 4 | skills/document | void | void | 0.47 | 0.34 | 2026-11-14 |
| learn | learn-lint-first | 1.9 | 5 | skills/learn | 1 | 0 | 0.61 | 0.55 | 2026-11-16 |
| save | route-save | 1.9 | 6 | skills/save | 1 | 0 | 0.68 | 0.37 | 2026-11-14 |
| spec | spec-tide-export | 1.9 | 7 | skills/spec | fail | fail | 1.21 | 1.07 | 2026-11-14 |
| watch | route-watch | 1.9 | 8 | skills/watch | 1 | 0 | 0.56 | 0.34 | 2026-11-14 |
| ship | ship-branch-push,ship-set-route | 3.8 | 9 | skills/ship | void | void | 1.09 | 0.95 | 2026-11-14 |
