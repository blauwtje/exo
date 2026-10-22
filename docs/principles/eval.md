# Eval engineering

Checked: 2026-10-22

Read it when: you design, grade or change an eval, a benchmark or a regression check for an agent.

- **Start with 20-50 simple tasks drawn from real failures.** A small set from real misses beats a large invented one. [1] exo: gap, `benchmarks/replay/cases/` holds 12 cases from real runs, but no index of real failures and fewer than 20
- **Write unambiguous tasks with reference solutions.** Two domain experts should reach the same verdict. [1] exo: `benchmarks/README.md` each safe and value task holds a reference `solution/`, `tests/benchmark-value.test.mjs` checks it fails on seed and passes on solution
- **Run multiple trials, each isolated in a clean environment.** One run hides variance; shared state leaks between runs. [1] exo: `benchmarks/README.md` fresh repository per cell, `benchmarks/run.mjs` `--runs`
- **Grade outcomes rather than exact step paths.** Agents reach a correct result by routes you did not foresee. [1] exo: `skills/build/references/test-design.md`
- **Calibrate LLM judges against human experts.** An uncalibrated judge drifts from what people accept. [1] exo: gap, `benchmarks/pressure/README.md` checks vote stability only, no human labels
- **Keep capability evals separate from regression evals.** Graduate a capability eval to regression once it passes reliably. [1] exo: gap
- **Grade each dimension with an isolated judge.** Score each rubric dimension separately rather than have one judge grade all of them. [1] exo: gap, `benchmarks/pressure/README.md`
- **Choose deterministic graders first.** Use code-based checks where possible, LLM graders only where needed. [1] exo: `skills/build/scripts/land-task.mjs` reruns the proof itself
- **The task verifier must be nearly perfect.** Otherwise the agent solves the wrong problem. [2] exo: `tests/benchmark-value.test.mjs` checks each reference solution fails on seed and passes on solution

## Sources

1. [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), 2026-01-09
2. [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler), 2026-02-05
