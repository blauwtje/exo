# Eval engineering

Checked: 2026-10-22

Read it when: you design, grade or change an eval, a benchmark or a regression check for an agent.

- **Start with 20-50 simple tasks drawn from real failures.** A small set from real misses beats a large invented one. [1] exo: gap, `benchmarks/replay/cases/` holds 11 cases from real runs, but no index of real failures and fewer than 20
- **Write unambiguous tasks with reference solutions.** Two domain experts should reach the same verdict. [1] exo: `benchmarks/README.md:60,64` each safe and value task holds a reference `solution/`, `tests/benchmark-value.test.mjs` checks it fails on seed and passes on solution
- **Run multiple trials, each isolated in a clean environment.** One run hides variance; shared state leaks between runs. [1] exo: `benchmarks/README.md:64` fresh repository per cell, `benchmarks/run.mjs:65` `--runs`
- **Grade outcomes rather than exact step paths.** Agents reach a correct result by routes you did not foresee. [1] exo: `skills/build/references/test-design.md:39`
- **Calibrate LLM judges against human experts.** An uncalibrated judge drifts from what people accept. [1] exo: gap, `benchmarks/pressure/README.md:20` checks vote stability only, no human labels
- **Keep capability evals separate from regression evals.** Graduate a capability eval to regression once it passes reliably. [1] exo: gap

## Sources

1. [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), 2026-01-09
