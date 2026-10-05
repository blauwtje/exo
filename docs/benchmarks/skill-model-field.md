A `model:` line on build or verify keeps the main session off Sonnet only in the first turn of a typed command, and does nothing when the skill is loaded through the Skill tool. That line is therefore not added.

# Probe: model-veld in SKILL.md, Claude Code 2.1.288, 2026-10-03

## Question

Does a `model:` line in a skill's frontmatter move the main session to that model, and for how long? The skills documentation (https://code.claude.com/docs/en/skills) says: "The override applies for the rest of the current turn and isn't saved to settings. The session model resumes when you send your next prompt." The subagents documentation (https://code.claude.com/docs/en/sub-agents) says: "A background subagent's results reach Claude as a completion notification in a later turn." Nowhere does it say whether that later turn keeps the skill's override.

## Setup

A throwaway plugin `probe` with one skill, `skills/probe/SKILL.md`:

```
---
name: probe
description: Use when the user asks to run the model probe.
model: haiku
---

1. Run `echo before-dispatch` with Bash.
2. Dispatch one general-purpose agent in the background (run_in_background true) with model haiku and the prompt "Reply with the word OK.", then end your turn without waiting.
3. When its completion notification arrives, run `echo after-notification` with Bash, then reply DONE.
```

Both sessions ran in `/tmp/exo-model-probe/work` (an empty git repo) with `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, session model `opus`:

```
claude -p "Load the probe skill and follow it." --plugin-dir /tmp/exo-model-probe/plugin --model opus --effort low --output-format json --max-budget-usd 1 --dangerously-skip-permissions
claude -p "/probe:probe" --plugin-dir /tmp/exo-model-probe/plugin --model opus --effort low --output-format json --max-budget-usd 1 --dangerously-skip-permissions
```

The first session (08b0041a) loads the skill through the Skill tool, as the lean-gates benchmark and exo's "Build here" route load build. The second (2f49d100) types the command, as a user would. The model per call is `message.model` of each assistant line in the transcript.

## Result

Times are UTC, from `~/.claude/projects/-private-tmp-exo-model-probe-work/<session>.jsonl`.

Session 1, through the Skill tool:

| Time | Model | Action |
|---|---|---|
| 09:30:21 | claude-opus-5-5 | Skill call |
| 09:30:23 | claude-opus-5-5 | Bash `echo before-dispatch` |
| 09:30:24 | claude-opus-5-5 | Agent in the background |
| 09:30:26 | claude-opus-5-5 | text, end of turn |
| 09:30:26 | - | task-notification |
| 09:30:28 | claude-opus-5-5 | Bash `echo after-notification` |
| 09:30:30 | claude-opus-5-5 | text DONE |

Session 2, typed `/probe:probe`:

| Time | Model | Action |
|---|---|---|
| 09:30:33 | claude-haiku-4-5-20251001 | thinking |
| 09:30:34 | claude-haiku-4-5-20251001 | Bash `echo before-dispatch` |
| 09:30:34 | claude-haiku-4-5-20251001 | Agent in the background |
| 09:30:36 | claude-haiku-4-5-20251001 | text, end of turn |
| 09:30:36 | - | task-notification |
| 09:30:38 | claude-opus-5-5 | Bash `echo after-notification` |
| 09:30:40 | claude-opus-5-5 | text DONE |

A skill loaded through the Skill tool ran every call on the session model, so its `model:` line had no effect. A typed skill command switched the model for the rest of that one turn. The turn opened by the background agent's completion notification ran on the session model again.

## Consequence for exo

Build ends its turn after every dispatch (`skills/build/references/run-loop.md:17`: "Dispatch silently, then end the turn; each completion notification resumes it."). A `model:` line on `skills/build/SKILL.md` or `skills/verify/SKILL.md` would therefore at most cover the work before the first dispatch of a typed `/exo:build`. If build is loaded through the Skill tool, as in the lean-gates benchmark and after spec's "Build here", it covers nothing.

Decision: no `model:` line on build or verify. The `/model sonnet` line for the next step of the fresh-chat route stays, because only a session-level model switch survives the turns that a notification opens.

## Not measured

Interactive sessions (without `-p`) and whether a later Claude Code version changes this behavior. Each route was measured once (n=1).

## Reproduce

Create the plugin with the `SKILL.md` from "Setup" in `/tmp/exo-model-probe/plugin/skills/probe/`, go to an empty git repo `/tmp/exo-model-probe/work` and run both commands from "Setup" with the two environment variables. Read the model per call from the transcript:

```
node -e 'for (const l of require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)) { const j = JSON.parse(l); if (j.type === "assistant") console.log(j.timestamp, j.message.model) }' ~/.claude/projects/-private-tmp-exo-model-probe-work/<session>.jsonl
```
