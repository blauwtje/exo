# exo

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
| `implementing` | A plan is run or resumed: one delegated build and two reviews per checkpoint, a commit each. |
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

Clone to `~/plugins/exo`. An installed plugin runs from the cache copy, so an edit is live only after `claude plugin update exo@blauwtje`; for a live tree start `claude --plugin-dir ~/plugins/exo`. Every skill edit follows the `skills-tool` skill.

## Verify

```bash
node verify.mjs
node verify.mjs --self-test
node --test 'tests/*.test.mjs'
claude plugin validate .
bash tests/smoke.sh
```

`evals/` is git-ignored: prompt cases and their runs live outside this repository.

## License

PolyForm Noncommercial 1.0.0: use and change it freely, sell it never. See `LICENSE`.
