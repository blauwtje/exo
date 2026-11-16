# Eval engineering

Checked: 2026-11-16

Read it when: you design, grade or change an eval, benchmark, regression check or keep/discard rule.

- **Start with 20-50 tasks from real failures.** [1] exo: `evals/`
- **Write unambiguous tasks with reference solutions.** [1] exo: gap
- **Report SEM and 95% CI with every score; cluster standard errors on the unit of randomisation.** [3] exo: gap
- **Compare to baseline as paired differences on shared tasks.** [3] exo: gap
- **Compute task count before a paid run, and run each stage alone with a cheap limit before the paid whole.** [3][8] exo: `CONTRIBUTING.md`
- **Give each run a fixed time budget; count aborted or timed-out runs as failures, or exclude and report them; never fill a default; an over-budget or broken run is a failure row, never a score; the human sets only the goal and the budget.** [4][7][9] exo: `evals/value.mjs`, decided: a run the cost or time cap cut is a failure row, and the count of such rows is printed with the result; no run is dropped without a count
- **Fix the seed.** [6] exo: gap
- **Change one thing per round, scored by one number the edited files cannot change; keep only a gain that clears the run noise, and at equal score or fewer net lines keep simpler code.** [6][7][10][11] exo: gap
- **Read a 0% pass rate as a broken task; the task verifier must be nearly perfect.** [1][2] exo: gap
- **A flat 100% or 0% on every level or arm is void, not fail, unless a positive control that injects a known effect of at least the threshold size, through the path the test measures, is detected; when it is detected, the flat result stands as the verdict, because a true null also looks flat.** [1] exo: `evals/value.mjs`
- **Grade outcomes, not step paths; choose deterministic graders first.** [1] exo: `skills/build/references/code-rules.md`
- **Use a pairwise or pass/fail judge; swap response order and control length for position and verbosity bias.** [5] exo: gap
- **Grade each dimension with an isolated judge, calibrated against humans.** [1][5] exo: gap, decided: one blinded judge scores both arms of a comparison in one pass on one scale
- **Hold out tasks the change was not tuned on.** [5] exo: gap
- **Run free regression evals on every change.** [5] exo: `verify.mjs`
- **Blind the candidate: an organic user prompt, no eval word in any file or prompt it sees, no hint that other candidates exist.** [12] exo: gap
- **Grade a chain of steps from the files the run really opened, not from its own claim.** [12] exo: gap
- **Have one blinded judge score both variants in one pass on one scale, and read every output yourself; a disagreement means a biased judge or an ambiguous rubric.** [12] exo: gap
- **Write the decision the result would change and the noise floor before the run; stop when the spread is larger than the effect.** [13] exo: gap
- **Ask why the number is not twice as good: name the limiter from a profile or counters, and rule out errors, skipped or cached work, code that never ran and an untuned side.** [13] exo: gap
- **Keep the run count, spread and limiter with the number.** [13] exo: gap
- **Fix one metric, its direction and a stop target with a floor on attempts; freeze the harness, prove it separates a hard case from an easy one, and have it print its error count.** [14] exo: gap
- **Log one row per attempt, kept or reverted, and revert a change that only "might help" in full.** [14] exo: gap

## Sources

1. Demystifying evals for AI agents, undated
2. Building a C compiler with Claudes, undated
3. Statistical approach to model evals, undated
4. Infrastructure noise in evals, undated
5. Evaluation best practices, undated
6. A Recipe for Training Neural Networks, undated
7. autoresearch program.md, undated
8. hn-time-capsule, undated
9. HackerTube, undated
10. autoresearch issue 651, undated
11. nanochat commits, undated
12. eval playbook, undated
13. principle-explain-the-number, undated
14. hillclimb playbook, undated
