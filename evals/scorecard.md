# Scorecard

Each release appends one row and no row is rewritten. The releasing session runs the commands; no script computes it.

- tracked files: `git ls-files | wc -l`
- check modules: `ls verify/checks | wc -l`
- test files: `ls tests | wc -l`
- check seconds: time `npm run check`
- always-on tokens: `claude plugin details exo`
- tokens per use of `build`, `gate`, `spec`, `diagnose` and `ship`: `claude -p "/skill-doctor"`, 7-day tokens divided by uses
- eval score with and without the plugin, cost ratio and time ratio: `claude plugin eval --json --max-cost-usd 38`
- model and effort: the setting of that eval run; a second row records the same eval with `--model` set to another model

| date | commit | tracked files | check modules | test files | check seconds | always-on tokens | build | gate | spec | diagnose | ship | eval score with / without | cost ratio | time ratio | model | effort |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-13 | 720b6cb3e | 2744 | 79 | 455 | 110 | 836 | 0.40M | 3.2M | 0.18M | 0.07M | 0.03M | | | | | |
| 2026-11-13 | 209aac095 | 1086 | 40 | 310 | 82 | 836 | 0.40M | 3.3M | 0.18M | 0.07M | 0.03M | 0.36 / 0.29, onvolledig: 14/20, Opus 5.5 effort medium | 2.17 | 1.99 | | |
| 2026-11-13 | gate-small | | | | | | | | | | | gate eval: pending, run by the lead | | | | |
| 2026-11-14 | 0b768fd0a | | | | | | | 3.1M | | | | 0.25 / 0.22, 20 of 20 cases scored, Opus 5.5 effort medium | 1.69 | 1.62 | | |
| 2026-11-14 | gate-small | | | | | | | | | | | gate eval: 7/9 passes, 0.4659 per pass | | | | |
| 2026-11-18 | model-rows | | | | | | | | | | | model rows eval: pending, run by the lead: copy the plugin to a temp folder, change only the model or effort in skills/diagnose/SKILL.md:25, run diagnose-repatch on both copies with --runs 6 and --max-cost-usd 5, compare as paired pass rates; grades the whole run, not the cause search alone; the research effort row has no case | | | | |
| 2026-11-18 | model-rows | | | | | | | | | | | model rows eval: void, the rule never ran: 12 of 12 diagnose-repatch runs called no Skill and no helper; criteria passes 6 of 6 with the Opus high line and 5 of 6 without, cost 1.70 and 1.68 USD; the research effort row has no case | | | | |
| 2026-11-18 | learn-list | | | | | | | | | | | learn list: measured in real headless sessions with the sandbox on, because the eval sandbox denies reads of the config folder that holds the transcripts, so no case can list: 3 of 3 runs called the Skill, ran corrections.mjs candidates and ended on one numbered list of 3 items with dates, one line that unpicked items are dropped and one question naming 1 3, all, none and later; the reply 1 3 in 1 of 1 session kept 2, rejected 1 and asked no second question; cost 1.12 USD; before the fix 3 of 3 eval runs and 1 of 1 real sandboxed run ended on EPERM | | | | |
| 2026-11-18 | diagnose-route | | | | | | | | | | | diagnose route: the case was at fault, not the description: on diagnose-stale-rate, a plain bug report, 9 of 9 runs called the Skill (6 with an Opus lead, 3 with a Sonnet lead) against 0 of 12 on diagnose-repatch, a request to commit a ready patch; criteria passes 3 of 3 with exo and 3 of 3 without, flat, so no gain in pass rate is shown (3 runs each: a difference of 1 is noise); cost per run 0.26 USD with and 0.22 without | | | | |
| 2026-11-18 | model-rows | | | | | | | | | | | model rows eval: cause-search row unmeasured: the helper was sent in 0 of 21 runs (12 diagnose-repatch, 9 diagnose-stale-rate) because the lead proved the cause itself each time, so the 6 against 6 comparison was not run; research row runs: on spec-late-fees 4 of 4 runs sent exo:researcher with effort high and wrote a brief under docs/specs, cost 0.67 USD per run; the criteria judge passed 1 of 2 after its fix (the failing run named no task count, which the skill does not ask for), so that grader is still too strict; the effect of high against medium is unmeasured, a 6 against 6 comparison is about 8 USD and did not fit the 12 USD session budget with 6.86 USD spent | | | | |
| 2026-11-18 | model-rows | | | | | | | | | | | model rows eval: research row measured without claude plugin eval: the open-points prompt of spec step 6 was sent to exo:researcher 18 times on one plan for the spec-late-fees project with 6 planted points, 6 runs each at effort low, medium and high, scored by one blinded judge: every arm found 33 of 36 points (5.5 of 6 per run; 5 points in 18 of 18 runs, the sixth in 3 of 6 runs in each arm), so effort changed nothing this test can see, low included; high used 13,066 tokens and 36 s per run against 10,767 and 20 s at medium and 9,775 and 16 s at low; limiter: 5 of 6 points sit at the ceiling and 6 runs per arm cannot show a difference smaller than about 3 of 6 on the sixth; decision: the open-points researcher runs at the agent's own effort and the 8 USD comparison is not run; the cause-search row stays in place, unmeasured, because the helper was sent in 0 of 21 runs and costs nothing until it is sent | | | | |
