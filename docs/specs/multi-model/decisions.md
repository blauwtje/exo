# Multi-model decisions

Criteria: exo runs on Claude Code, Codex and OpenCode from one source; the user keeps their model pick; fewer moving parts; every claim checked offline. Evidence: `.exo/research/deepseek-opencode/answer.md`, `.exo/research/codex-harness/answer.md` and the repo lines cited below.

## Repo facts

- Only two adapters exist: `harnesses/registry.mjs:9` lists `[claude, codex]`, and `lib/host.mjs:3` lists the same hosts.
- Codex serves SessionStart and PreToolUse Bash only (`harnesses/codex/hooks.mjs:13-14`), so `hooks/agent-effort.mjs` never fills a Codex spawn's model or effort; each agent's model and effort are baked at install from the `codex` column (`harnesses/codex/generate.mjs:118`).
- `renderAgent` writes `sandbox_mode` (`harnesses/codex/generate.mjs:64`), while `READ_ONLY` is empty (`harnesses/codex/generate.mjs:37`), so every agent gets `workspace-write`.
- `deepseek` and `zai` in `lib/run-providers.json:10-41` are Anthropic-format env blocks that still drive Claude Code; there is no OpenAI or OpenCode path.
- DeepSeek ids: `lib/model-kinds.json:17` and `lib/run-providers.json:11-21` use `deepseek-flash`, the current id served by DeepSeek V4.1 Flash; no live code names a retired id such as `deepseek-v4-flash`.

## Karpathy reading

- Choice: the four-principle coding guideline (think before coding, simplicity first, surgical changes, goal-driven execution with a verifiable done-check) plus load-only-what-the-step-needs, written once in `docs/principles/prompt.md` and applied through the shared non-Claude agent preamble, because exo's Claude briefs already carry `Reads:`, `Proof:` and BLOCKED returns; rejected: a new rule line in every skill (more always-loaded text, against simplicity first), a Karpathy-specific skill (one more name to route).
- Applied to code: the plan drops `sandbox_mode` instead of guarding it, holds capabilities as data instead of prose, and forks no skill.
- Caveat: the guideline is a community distillation of Karpathy's notes, not his own text; the principles page cites it as such.

## Harness shape

- Choice: one source plus a thin generator per harness (`harnesses/opencode/generate.mjs` reusing the Codex rewrite helpers), because the Codex harness already works this way and prior art (multi-tool skill repos) converges on it; rejected: forked OpenCode skills (two copies drift), one generic generator for every harness now (a refactor of working Codex code with no second user yet).
- Choice: a capability matrix `harnesses/capabilities.json` and a static check against the registry, the Codex hook list and the `lib/model-kinds.json` effort columns, because a mismatch then fails `npm run check`; rejected: a prose table in CONTRIBUTING.md (unchecked), capabilities exported from each adapter (no single place to compare harnesses).

## Per-harness settings

| Harness | Subagents | Workers | Hooks | Effort | Prompt style |
| --- | --- | --- | --- | --- | --- |
| claude | Agent tool, kinds filled by `hooks/agent-effort.mjs` | 4 (`orchestratorWorkers`) | all of `hooks/hooks.json` | low to max | current terse rules |
| codex | custom agents spawned in prose | 4 | SessionStart, PreToolUse Bash | low to max, `effortShift` on strong | outcome-first preamble |
| opencode | `mode: subagent` markdown agents | 2 | none | none by default, opt-in `#variant` | outcome-first preamble |

- Choice: 2 workers on OpenCode, because Go limits are dollar budgets per 5 hours and DeepSeek's 1M context favours fewer, larger subagents; rejected: 4 like Claude (burns a Go budget window fast), 1 (no parallel research at all).
- Choice: Codex keeps 4 workers, because Codex caps threads itself through `max_concurrent_threads_per_session`; rejected: a lower exo cap (would hide the user's own setting).
- Tool-call reliability: DeepSeek needs `reasoning_content` replayed with tools, which the host does, not exo; exo's share is a preamble that asks for evidence and one retry of a malformed tool call; rejected: a strict-tool shim (exo calls no model API).

## OpenCode model and effort

- Choice: generated agents name no `model`, so they inherit the model the user picked (`deepseek-flash`, V4 Pro or any Go model); effort becomes `model: <model>#<variant>` only when the user sets `opencode.model` and `opencode.variants` in `~/.config/exo/run.json`, because OpenCode attaches a variant only to a model ref; rejected: a hardcoded `opencode-go/deepseek-flash` (overrides the user's pick), a variant with no model (OpenCode has no such field), no effort route at all (the request asks for an optional one).

## OpenAI by API key

- Choice: an OpenAI key runs through OpenCode with its OpenAI provider, or through Codex's own API-key login; exo stores no OpenAI key, because `lib/run-providers.json` only drives Claude Code through Anthropic-format endpoints; rejected: an `openai` run provider (Claude Code cannot talk to the OpenAI API), a new exo launcher for the OpenAI API (a second agent loop to maintain).

## Codex sandbox

- Choice: drop `sandbox_mode` from agent TOML, because the Codex docs say an agent file cannot override it and the empty `READ_ONLY` list means no agent ever got another value; rejected: keep it (misleading, and a raise to `workspace-write` if Codex ever honoured it in a read-only session), verify against Codex source first (no offline route; the drop is safe either way).

## Prompt style off Claude

- Choice: one outcome-first preamble for Codex and OpenCode agents (goal, done-check, assumptions or BLOCKED, named files only, evidence), because the GPT-5.x guide prefers short goal-plus-stop prompts with few absolutes and DeepSeek has no prompt guide; rejected: a rules pass that rewrites every absolute in skill text (a large rewrite engine for an unmeasured gain), no change (Claude-tuned absolutes reach GPT unchanged).

## Skills on OpenCode (open, lead decides)

- OpenCode also reads `.agents/skills` and `.claude/skills`, so a Codex install in the same home shows the Codex-worded skills to OpenCode too, and duplicate-name handling is undocumented.
- Pick: write OpenCode's own tree under `~/.config/opencode/skills/`, and record the clash as a Manual check, because it keeps each harness's wording right; rejected: reuse the Codex tree in `.agents/skills` (Codex tool names such as apply_patch in OpenCode), skip skills and rely on `.claude/skills` (exo installs as a plugin, so its skills are not there).
