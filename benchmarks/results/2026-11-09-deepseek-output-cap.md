# DeepSeek output cap for mechanical kinds

Verdict: no harness support. No cap ships.

Baseline: the current run-plan children set no output cap, so a Flash reply is bounded only by the model default.

Reason: nothing in this repository or in the kept sweep logs shows `CLAUDE_CODE_MAX_OUTPUT_TOKENS` arriving at `https://api.deepseek.com/anthropic` as `max_tokens`. Proving it needs a paid DeepSeek request with the request body captured, which this task did not run. An `outputCaps` map the endpoint may ignore would add config with no effect, so `lib/model-kinds.json` and `skills/build/scripts/run-plan-provider.mjs` are unchanged.

Exclusions: no live run, no cost spent.

Next step: capture one request body from a Flash child started with the variable set, and ship `outputCaps` only if it carries the cap as `max_tokens`.
