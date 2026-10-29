# Haiku against Sonnet for exo:locate-code

Command: `node benchmarks/locate-recall.mjs` (quick tier: 3 briefs x 1 run per model, agent `exo:locate-code`, effort medium, repository at 2fb2e0bf). Raw sessions: `2026-10-29-locate-haiku.md.json`.

| Model | Recall | Precision | Report recall | Cost | Mean wall | Mean turns |
|---|---|---|---|---|---|---|
| haiku | 83.3% | 85.0% | 91.7% | $0.0241 | 35.1 s | 10 |
| sonnet | 100.0% | 76.7% | 100.0% | $0.2575 | 30.4 s | 7 |

Haiku costs 10.7 times less per session and is not faster. The recall gap is 16.7 points, above the 5 point bar, so the full tier (10 briefs x 3 runs) did not run. One run per brief and model is 3 samples: the gap is 2 missed files of 12.

## Misses (transcripts read)

- context-limit-note (haiku, missed `hooks/hooks.json`): the search was sound but it never opened `hooks/hooks.json`, so the hook registration went unreported. It read the lib, both hooks and the test, and named `verify/checks/injected-context.mjs` as an unsure file. Search miss: stopped one hop early.
- exo-prune (haiku, missed `tests/session-start-prune.test.mjs`): it read the file and listed it in its written report, but the 10 line return kept one test and dropped it. Compression miss under the line cap, not a search miss. The report file recall of 91.7% counts it.
- Sonnet missed nothing; its lower precision is extra files that are real neighbours (`run-plan.mjs`, `lead-context.mjs`, `docs/settings.md`), not wrong ones, so the precision score punishes thoroughness here.

## Read

Single-hop lookups (paid-benchmark-guard) tie at 100%. Haiku loses on the second hop (registration file) and on trimming a list to the cap. At 10x lower cost a Haiku first pass with a Sonnet fallback on a thin return could pay, but this sample is too small to decide; the full tier would need Haiku within 5 points first.
