A previous orchestrator stopped at its context limit after phase 1. Its result file `.exo/orchestrate/result.md` holds the parts, the worker returns of phase 1 and the next phase. Continue from it and finish every part it lists.

Result file: `.exo/orchestrate/result.md`, kept current, one line per part naming its id, its phase number and its verdict.
Done: every part's change is in this checkout's working tree, committed or not, and `npm test` passes.
