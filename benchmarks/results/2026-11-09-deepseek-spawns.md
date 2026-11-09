# DeepSeek Flash spawns: Agent calls per flow cell

Change: on provider `deepseek` the Agent hook (`hooks/agent-effort.mjs`) appends one line to an `exo:orchestrator` prompt with `Workers: 1`, telling it to run its single unit itself and spawn no worker.

Command: `node benchmarks/count-agent-calls.mjs <sweep>/flow-low` over the kept 10 flow-low cells (`.exo/kept/deepseek-flash/deepseek-flash/sweep/flow-low/*/usage.json` and their transcripts).

## Before (kept records, base)

- 32 Agent calls in 10 cells, 3.2 per cell: build-task 16, task-runner 6, research-worker 5, general-purpose 5.
- `orchestratorWorkersOne` is 0: in these cells the lead is the orchestrator, and no `exo:orchestrator` call carried `Workers: 1`.

## After

- Not measured on a live cell: no new DeepSeek run was spent. On the kept records the hook removes 0 of 32 calls, because none was a `Workers: 1` orchestrator part.
- Each such part in a spec or research run saves one orchestrator spawn: one cold prefix of about 23k tokens plus one thinking turn.
- The hook behaviour is proven by `tests/agent-effort.test.mjs` (line added on deepseek only, for `Workers: 1` only, once).
- The after figure for flow cells comes from the repeat-3 flow rerun in Decision 14 of the plan.
