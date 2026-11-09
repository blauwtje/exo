# Run exo on Claude, Codex and OpenCode

## Goal
exo installs into Claude Code, Codex and OpenCode from one source, with each harness's subagents, hooks, efforts and worker count held as checked data, and the user's own OpenCode model inherited.

## Verdict
Verdict: go
Objection: OpenCode hook and skill-clash behaviour is read from docs only, so the OpenCode harness ships with no hooks and the skill folder pick is an open choice for the lead (decisions.md, Skills on OpenCode).

## Decisions
1. Karpathy reading: the four-principle coding guideline (think before coding, simplicity first, surgical changes, goal-driven execution with a verifiable done-check) plus load-only-what-the-step-needs; it lands as one principles section and as the shared non-Claude agent preamble, not as new rules in every skill (exo decided).
2. One source, one thin generator per harness: `harnesses/opencode/` reuses the Codex rewrite helpers and forks no skill (exo decided).
3. A capability matrix `harnesses/capabilities.json` is the data; a static check fails when an adapter, its hook events or its effort column disagree with it (exo decided).
4. "OpenAI models via an API key in another harness" is the OpenCode harness with the user's own provider key; exo stores no OpenAI key, because `lib/run-providers.json` only drives Claude Code through Anthropic-format endpoints (exo decided).
5. OpenCode agent files name no `model`; effort maps to a `#variant` only when the user sets `opencode.model` and `opencode.variants` in `~/.config/exo/run.json` (exo decided).
6. Codex agent TOML drops `sandbox_mode`, because the Codex docs say an agent file cannot override it and `READ_ONLY` is empty, so every agent already got `workspace-write` (exo decided).
7. DeepSeek ids in code are already current (`deepseek-flash`); no id changes (exo decided, grep evidence in decisions.md).
8. Every rejected alternative is in `docs/specs/multi-model/decisions.md` (exo decided).

## Non-goals
- No live run against OpenCode Go, DeepSeek or OpenAI keys; every test runs offline.
- No OpenCode plugin port of exo's hooks, no new `run` provider and no change to the Claude adapter.

## Assumptions
- [code] Only `claude` and `codex` adapters exist (`harnesses/registry.mjs:9`); `lib/host.mjs:3` lists the same two hosts.
- [code] Codex serves only SessionStart and PreToolUse Bash (`harnesses/codex/hooks.mjs:13-14`), so `hooks/agent-effort.mjs` never runs there.
- [docs] OpenCode reads markdown agents from `.opencode/agents/` or `~/.config/opencode/agents/`, a subagent with no `model` inherits the parent's, and `model: provider/model#variant` is the only per-agent effort route.

## Acceptance
- `node --test tests/harness-capabilities.test.mjs` passes and fails when a matrix row and an adapter disagree (Task 1).
- No generated Codex agent holds `sandbox_mode` (Task 2).
- The OpenCode tree holds one agent file per exo agent with no `model:` line by default (Task 3).
- `node install.mjs --harness opencode` installs, updates and removes in a temp home (Task 4).
- `npm run check` passes (Success criterion).

## Manual checks
- In OpenCode with an OpenCode Go key, pick `deepseek-flash`, run `exo:spec` on a small request, and see its subagent run on the picked model.
- With Codex installed, spawn `exo-research-worker` and see it run in the session's sandbox.

## Plan basis
Repository: .
Branch: multi-model
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(harnesses): run exo across Claude, Codex and OpenCode
Lint: none
App: none
Allow: none

## Success criterion
`npm run check` passes.
Red: none (each task's Proof shows its own red; the suite passes on the base)
Product run: none (exo is a plugin with no bin or start script)

## Checkpoint
- Blocks first: Task 1.
- Parallel: none.
- Shared state: `harnesses/capabilities.json` is read by Tasks 2 to 5 and `harnesses/registry.mjs` by Tasks 1 and 4, so the tasks run in order.
- Smallest safe split: one harness concern per task, each with its own test.

## Tasks

### Task 1: feat(harnesses): hold each harness's capabilities as data and check every adapter against it
Depends on: none | Files: `harnesses/capabilities.json`, `verify/checks/harness-capabilities.mjs`, `verify/late-checks.mjs`, `lib/host.mjs`, `tests/harness-capabilities.test.mjs` | Data: one JSON object keyed by harness name, each row holding `subagents`, `hooks` (event list), `efforts`, `maxWorkers` and `promptStyle`, with claude 4 workers and Claude hooks, codex 4 workers and SessionStart plus PreToolUse Bash, opencode 2 workers, no hooks and no efforts; the check fails when the registry names and the rows differ, when `harnesses/codex/hooks.mjs` serves other events than its row, or when a provider column in `lib/model-kinds.json` maps to an effort its harness row lacks; `lib/host.mjs` takes its host list from the row names | Proof: node --test tests/harness-capabilities.test.mjs

### Task 2: fix(codex): stop writing sandbox_mode into generated agent files
Depends on: 1 | Files: `harnesses/codex/generate.mjs`, `tests/codex-rules.test.mjs`, `CONTRIBUTING.md` | Data: the TOML line list in `renderAgent`, without `sandbox_mode` and without the empty `READ_ONLY` list, so a Codex agent inherits the session sandbox | Proof: node --test tests/codex-rules.test.mjs

### Task 3: feat(opencode): generate OpenCode agents and skills from the Claude sources
Depends on: 1 | Files: `harnesses/opencode/generate.mjs`, `harnesses/opencode/host-note.md`, `tests/opencode-generate.test.mjs` | Data: an in-memory map of path to text, like `generateTree` in `harnesses/codex/generate.mjs`, holding `agents/exo-<name>.md` with `mode: subagent`, a description and the agent body, and each skill's Markdown with `${CLAUDE_PLUGIN_ROOT}` set to the exo clone; no `model:` line unless the user's run.json sets `opencode.model`, then `model: <model>#<variant>` from `opencode.variants` for the kind's effort | Proof: node --test tests/opencode-generate.test.mjs

### Task 4: feat(opencode): install, update and remove exo for OpenCode
Depends on: 3 | Files: `harnesses/opencode/adapter.mjs`, `harnesses/registry.mjs`, `tests/install.test.mjs` | Data: the adapter exports of `harnesses/codex/adapter.mjs` (`name`, `label`, `detect`, `install`, `update`, `remove`, `recorded`), writing the Task 3 tree to `~/.config/opencode/` or `<project>/.opencode/` and recording it in the same installed-record shape the Codex adapter keeps | Risk: persisted format | Proof: node --test tests/install.test.mjs

### Task 5: feat(harnesses): give non-Claude agents an outcome-first preamble with a done-check
Depends on: 2, 3 | Files: `harnesses/codex/agent-preamble.md`, `harnesses/codex/host-note.md`, `harnesses/opencode/host-note.md`, `tests/codex-brief-rules.test.mjs`, `tests/agent-effort.test.mjs` | Data: one preamble text, shared by the Codex and OpenCode generators, that states the goal, the brief's done-check, list-assumptions-or-report-BLOCKED, edit only the named files, return evidence as command output or path:line, and retry a malformed tool call once, with no step or turn absolutes | Evidence: none (no non-Claude eval suite exists offline; the Manual checks cover it) | Proof: node --test tests/codex-brief-rules.test.mjs

### Task 6: docs(principles): add the Karpathy coding reading and document the three harnesses
Depends on: 4, 5 | Files: `docs/principles/prompt.md`, `CONTRIBUTING.md`, `CHANGELOG.md` | Data: four principle bullets with their exo file and a Sources entry in `prompt.md`; the `install.mjs --harness` row and the harness section in `CONTRIBUTING.md` naming opencode and `harnesses/capabilities.json`; one line per Task 1 to 5 under `## Unreleased` | Proof: grep -c -E 'Think before coding|Simplicity first|Surgical changes|Goal-driven execution' docs/principles/prompt.md
