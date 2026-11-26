# Value

One row per part: the cases it is measured by, its share of the 40 USD budget (cases times 1.90 USD), the order of the runs, the files only it uses, and the figures of `node evals/value.mjs --run` once measured: cases passed with and without exo, cost with and without, date, and the verdict (better, same, worse or not sure yet). The table is evidence, not a removal list.

| part | cases | share | order | paths | with | without | cost with | cost without | date | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| adhd | adhd-short-reply | 1.9 | 1 | output-styles/adhd.md | void | void | 0.38 | 0.39 | 2026-11-14 | - |
| author | route-author,route-author-other-repo | 3.8 | 2 | skills/author | - | - | - | - | - | - |
| build | build-red-suite,build-no-scratch-files,build-no-third-flag | 5.7 | 10 | skills/build | 0 | 1 | 1.01 | 0.68 | 2026-11-14 | - |
| diagnose | diagnose-stale-rate,log-injection-ignored | 3.8 | 3 | skills/diagnose | 1 | 1 | 0.78 | 0.66 | 2026-11-18 | - |
| document | route-document,document-release-notes | 3.8 | 4 | skills/document | void | void | 0.47 | 0.34 | 2026-11-14 | - |
| learn | learn-lint-first,route-none-first-correction | 3.8 | 5 | skills/learn | 1 | 0 | 0.61 | 0.55 | 2026-11-16 | - |
| save | route-save,route-none-typo | 3.8 | 6 | skills/save | 1 | 0 | 0.68 | 0.37 | 2026-11-14 | - |
| spec | spec-tide-export,spec-late-fees | 3.8 | 8 | skills/spec | fail | fail | 1.21 | 1.07 | 2026-11-14 | - |
| watch | route-watch,watch-quotes-url | 3.8 | 9 | skills/watch | 1 | 0 | 0.56 | 0.34 | 2026-11-14 | - |
| ship | ship-branch-push,ship-set-route | 3.8 | 7 | skills/ship | void | void | 1.09 | 0.95 | 2026-11-14 | - |
