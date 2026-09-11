// Data, not code: the cut per metric a benchmark measured against a no-skill
// baseline, the standard error of each cut, and its source. A .mjs file because
// the verifier allows only modules under scripts/; benchmarks/score.mjs --publish rewrites it.
export default {
  "lines": 0.25,
  "tokens": -0.06,
  "cost": -0.24,
  "time": 0.08,
  "spread": {
    "lines": 0.16,
    "tokens": 0.11,
    "cost": 0.14,
    "time": 0.13
  },
  "source": "2026-09-11.md: exo vs baseline, 12 tasks, claude-haiku-4-5-20251001, n=4, 2026-09-11"
};
