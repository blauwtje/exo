# Value

One row per part: the cases it is measured by, its share of the 40 USD budget (cases times 1.90 USD), the order of the runs, the files only it uses, and the figures of `node evals/value.mjs --run` once measured: cases passed with and without exo, cost with and without, and date. The table is evidence, not a removal list.

| part | cases | share | order | paths | with | without | cost with | cost without | date |
|---|---|---|---|---|---|---|---|---|---|
| adhd | adhd-short-reply | 1.9 | 1 | output-styles/adhd.md | 0 | 0 | 0.38 | 0.39 | 2026-11-14 |
| agent-effort | agent-effort-worker | 1.9 | 2 | hooks/agent-effort.mjs | 1 | 1 | 0.49 | 0.56 | 2026-11-14 |
| configure | configure-show-settings | 1.9 | 5 | skills/configure | 1 | 0 | 0.69 | 0.47 | 2026-11-14 |
| context-limit | context-limit-read-cap | 1.9 | 6 | hooks/context-limit.mjs | 0 | 0 | 0.40 | 0.37 | 2026-11-14 |
| dispatch-bash | value-destructive-safe | 1.9 | 8 | hooks/dispatch-bash.mjs | 0 | 0 | 0.86 | 0.85 | 2026-11-14 |
| dispatch-edit | value-test-pollution | 1.9 | 9 | hooks/dispatch-edit.mjs | 0 | 1 | 0.74 | 0.79 | 2026-11-14 |
| author | route-author | 1.9 | 3 | skills/author | 0 | 0 | 0.82 | 0.63 | 2026-11-14 |
| run | run-no-wait | 1.9 | 11 | hooks/run-no-wait.mjs;hooks/run-watch.mjs;hooks/run-stall-guard.mjs | 0 | 0 | 0.29 | 0.26 | 2026-11-14 |
| save | route-save | 1.9 | 12 | skills/save | 1 | 0 | 0.68 | 0.37 | 2026-11-14 |
| session | route-no-skill | 1.9 | 13 | hooks/session-start.mjs;hooks/session-end.mjs | 1 | 1 | 0.36 | 0.30 | 2026-11-14 |
| watch | route-watch | 1.9 | 14 | skills/watch | 1 | 0 | 0.56 | 0.34 | 2026-11-14 |
| document | route-document | 1.9 | 10 | skills/document | 0 | 0 | 0.47 | 0.34 | 2026-11-14 |
| build | build-red-suite | 1.9 | 4 | skills/build | 0 | 1 | 1.01 | 0.68 | 2026-11-14 |
| diagnose | diagnose-repatch | 1.9 | 7 | skills/diagnose | 0 | 1 | 1.01 | 0.88 | 2026-11-14 |
| gate | gate-red-check,gate-skip-review | 3.8 | 15 | skills/gate | 2 | 1 | 2.18 | 1.01 | 2026-11-14 |
| ship | ship-branch-push,ship-set-route | 3.8 | 16 | skills/ship | 0 | 0 | 1.09 | 0.95 | 2026-11-14 |
| spec | spec-deepseek-worker,spec-tide-export | 3.8 | 17 | skills/spec | 0 | 0 | 1.21 | 1.07 | 2026-11-14 |
