// Data, not code: the cut per metric a benchmark measured against a no-skill
// baseline, the standard error of each cut, and its source. A .mjs file because
// the verifier allows only modules under scripts/; benchmarks/score.mjs --publish rewrites it.
export default {
  "lines": 0.24,
  "tokens": 0.03,
  "cost": 0.08,
  "time": 0.15,
  "spread": {
    "lines": 0.17,
    "tokens": 0.09,
    "cost": 0.1,
    "time": 0.12
  },
  "source": "2026-09-11-haiku.md: exo vs baseline, 12 tasks, claude-haiku-4-5-20251001, n=4, 2026-09-11"
};
