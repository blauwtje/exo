# exo

[![quality](https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg)](https://github.com/blauwtje/exo/actions/workflows/quality.yml)

One engineering process for Claude Code, as a plugin: skills that take turns, and agents that keep discovery off the main context.

## Install

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

Restart Claude Code. The `using-exo` skill is injected at every session start, clear and compaction; every other skill is invoked as `exo:<name>`.

## Skills

| Skill | Fires when |
|---|---|
| `shaping` | An outcome or feature request has no chosen solution. |
| `planning` | A plan is requested, a planning mode is active, or another executor runs the work. |
| `implementing` | A plan is run or resumed: one delegated build and two reviews per task, a commit each. |
| `implementing-batch` | A decided change builds in the session: more than one file, a dependency, a signature or tests. |
| `debug` | Existing behavior fails and the cause is unproven. |
| `deepen` | The user asks where to improve architecture without naming the change. |
| `research` | A decision hinges on a pinned external version's behavior. |
| `designing` | A visual surface is created or changed. |
| `issuing`, `ship-issue`, `merge-prs` | GitHub issue and pull-request workflows, user-invoked. |
| `skills-tool` | A skill or agent is created, edited or judged too long. |
| `using-exo` | Session start; explains the rest. |

## Agents and the session hook

`agents/` holds the delegates the skills dispatch, each pinned to the cheapest model and the narrowest tool list its job allows. `hooks/hooks.json` wires one hook: a SessionStart injection that hands the model the `using-exo` body, because a skill body is read only when invoked and that one says when to invoke the others. It needs `bash` and `jq` on `PATH`. The plugin ships no guard hook: a guard caps what a machine may do and belongs in that machine's own configuration, not in a shared plugin.

## Develop

Clone it anywhere you keep projects. An installed plugin runs from the cache copy, so an edit is live only after `claude plugin update exo@blauwtje`; for a live tree start `claude --plugin-dir <your clone>`. Every skill edit follows the `skills-tool` skill.

## Verify

```bash
npm run check          # the gate: verifier, its self-test, and the script tests
npm run validate       # the 12 structural checks over the skill corpus
npm test               # the scripts under skills/designing/scripts/
npm run smoke          # a real session lists the exo: skills; calls a model
claude plugin validate .
```

Node 22 or newer, plus `bash` and `jq` on `PATH`. Nothing to install: every check runs on the Node standard library. CI runs `npm run check` on Node 22 and 24 for every pull request.

`verify/budgets.mjs` names the skills the verifier checks, so a new skill is unverified until it is listed there. `evals/` and `docs/` are git-ignored: prompt cases, their runs and research notes live outside this repository.

## License

PolyForm Noncommercial 1.0.0: use and change it freely, sell it never. See `LICENSE`.
