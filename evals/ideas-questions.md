# exo:ideas benchmark questions

The old and new version each run every question once with `claude -p "/exo:ideas <question>"`, and are compared on helper count, wall time and a blinded top-3 judgment.

1. How could a small public library with a budget under 2,000 euros a year get more teenagers aged 13 to 17 to visit every week?
2. How could a 6-person software team cut the time pull requests wait for review by half without lowering code quality?
3. How could a two-person household cut its food waste by half without spending more time on cooking?

## Results

Real runs on 2026-11-26, main session opus, same 3 questions.

| Version | Q1 helpers / min | Q2 helpers / min | Q3 helpers / min | Average helpers | Average min |
| --- | --- | --- | --- | --- | --- |
| old (main) | see baseline | | | 17.7 | 5.23 |
| v1 (16/20 bar + extra round) | 5 / 6.1 | 3 / 2.8 | 5 / 6.0 | 4.3 | 4.97 |
| v2 (this change) | 4 / 2.28 | 4 / 2.31 | 4 / 1.94 | 4.0 | 2.18 |

- v2 versus old: 77% fewer helpers, 58% less time. Strong ideas (16/20 or more and beating the best existing answer in both orders): 0 of 6 in each v2 run.
- Blinded judge (fresh opus subagent per question, title plus description of each top 3, sets labelled A and B at random, no scores or version marks): new wins 3 of 3 (Q1 new=B, Q2 new=A, Q3 new=B).
