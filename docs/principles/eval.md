# Eval engineering

Checked: 2026-11-02

Read it when: you design, grade or change an eval, benchmark, regression check or keep/discard rule.

- **Start with 20-50 tasks from real failures.** [1] exo: `evals/`
- **Write unambiguous tasks with reference solutions.** [1] exo: `tests/benchmark-value.test.mjs`
- **Report SEM and 95% CI with every score; cluster standard errors on the unit of randomisation.** [3] exo: `lib/eval-stats.mjs` `meanCi`, `clusteredMeanCi`
- **Compare to baseline as paired differences on shared tasks.** [3] exo: `lib/eval-stats.mjs` `pairedDiff`
- **Compute task count before a paid run.** [3] exo: `lib/eval-stats.mjs` `powerLine`
- **Give each run a fixed time budget; count aborted or timed-out runs as failures, or exclude and report them; never fill a default.** [4][7] exo: `skills/build/scripts/round.mjs` `timedOut`
- **Fix the seed.** [6] exo: `skills/build/scripts/round.mjs` `scoreEnv`
- **Change one thing per round; at equal score keep simpler code.** [6][7] exo: `skills/build/scripts/round.mjs` `not-one-commit`, `judgeKeep`
- **Read a 0% pass rate as a broken task; the task verifier must be nearly perfect.** [1][2] exo: `tests/benchmark-value.test.mjs`
- **Grade outcomes, not step paths; choose deterministic graders first.** [1] exo: `skills/build/references/test-design.md`
- **Use a pairwise or pass/fail judge; swap response order and control length for position and verbosity bias.** [5] exo: `skills/edit-skills/references/pressure-judge.md`
- **Grade each dimension with an isolated judge, calibrated against humans.** [1][5] exo: `lib/judge-agreement.mjs`
- **Hold out tasks the change was not tuned on.** [5] exo: `lib/holdout.mjs`
- **Run free regression evals on every change.** [5] exo: `evals/`

## Sources

1. [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
2. [Building a C compiler with Claudes](https://www.anthropic.com/engineering/building-c-compiler)
3. [Statistical approach to model evals](https://www.anthropic.com/research/statistical-approach-to-model-evals)
4. [Infrastructure noise in evals](https://www.anthropic.com/engineering/infrastructure-noise)
5. [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
6. [A Recipe for Training Neural Networks](https://karpathy.github.io/2019/04/25/recipe/)
7. [autoresearch program.md](https://github.com/karpathy/autoresearch)
