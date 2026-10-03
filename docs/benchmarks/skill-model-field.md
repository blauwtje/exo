Een `model:`-regel op build of verify houdt de hoofdsessie alleen in de eerste beurt van een getypt commando van Sonnet af en doet niets wanneer de skill via de Skill-tool wordt geladen. Daarom komt die regel er niet.

# Probe: model-veld in SKILL.md, Claude Code 2.1.288, 2026-10-03

## Vraag

Verplaatst een `model:`-regel in de frontmatter van een skill de hoofdsessie naar dat model, en hoe lang? De documentatie van skills (https://code.claude.com/docs/en/skills) zegt: "The override applies for the rest of the current turn and isn't saved to settings. The session model resumes when you send your next prompt." Die van subagents (https://code.claude.com/docs/en/sub-agents) zegt: "A background subagent's results reach Claude as a completion notification in a later turn." Of die latere beurt de override van de skill houdt, staat nergens.

## Opzet

Een wegwerpplugin `probe` met één skill, `skills/probe/SKILL.md`:

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

Beide sessies draaiden in `/tmp/exo-model-probe/work` (een lege git-repo) met `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, sessiemodel `opus`:

```
claude -p "Load the probe skill and follow it." --plugin-dir /tmp/exo-model-probe/plugin --model opus --effort low --output-format json --max-budget-usd 1 --dangerously-skip-permissions
claude -p "/probe:probe" --plugin-dir /tmp/exo-model-probe/plugin --model opus --effort low --output-format json --max-budget-usd 1 --dangerously-skip-permissions
```

De eerste sessie (08b0041a) laadt de skill via de Skill-tool, zoals de lean-gates-benchmark en exo's route "Build here" build laden. De tweede (2f49d100) typt het commando, zoals een gebruiker. Het model per aanroep is `message.model` van elke assistentregel in het transcript.

## Resultaat

Tijden zijn UTC, uit `~/.claude/projects/-private-tmp-exo-model-probe-work/<sessie>.jsonl`.

Sessie 1, via de Skill-tool:

| Tijd | Model | Actie |
|---|---|---|
| 09:30:21 | claude-opus-5-5 | Skill-aanroep |
| 09:30:23 | claude-opus-5-5 | Bash `echo before-dispatch` |
| 09:30:24 | claude-opus-5-5 | Agent op de achtergrond |
| 09:30:26 | claude-opus-5-5 | tekst, einde van de beurt |
| 09:30:26 | - | task-notification |
| 09:30:28 | claude-opus-5-5 | Bash `echo after-notification` |
| 09:30:30 | claude-opus-5-5 | tekst DONE |

Sessie 2, getypt `/probe:probe`:

| Tijd | Model | Actie |
|---|---|---|
| 09:30:33 | claude-haiku-4-5-20251001 | denken |
| 09:30:34 | claude-haiku-4-5-20251001 | Bash `echo before-dispatch` |
| 09:30:34 | claude-haiku-4-5-20251001 | Agent op de achtergrond |
| 09:30:36 | claude-haiku-4-5-20251001 | tekst, einde van de beurt |
| 09:30:36 | - | task-notification |
| 09:30:38 | claude-opus-5-5 | Bash `echo after-notification` |
| 09:30:40 | claude-opus-5-5 | tekst DONE |

Een skill die via de Skill-tool werd geladen draaide elke aanroep op het sessiemodel, dus zijn `model:`-regel had geen effect. Een getypt skill-commando zette het model om voor de rest van die ene beurt. De beurt die de completion notification van de achtergrondagent opende, draaide weer op het sessiemodel.

## Gevolg voor exo

Build beëindigt zijn beurt na elke dispatch (`skills/build/references/run-loop.md:17`: "Dispatch silently, then end the turn; each completion notification resumes it."). Een `model:`-regel op `skills/build/SKILL.md` of `skills/verify/SKILL.md` zou dus hooguit het werk vóór de eerste dispatch van een getypte `/exo:build` dekken. Wordt build via de Skill-tool geladen, zoals in de lean-gates-benchmark en na spec's "Build here", dekt hij niets.

Besluit: geen `model:`-regel op build of verify. De regel `/model sonnet` voor de volgende stap van de route met een verse chat blijft, want alleen een modelwissel op sessieniveau overleeft de beurten die een notification opent.

## Niet gemeten

Interactieve sessies (zonder `-p`) en de vraag of een latere Claude Code-versie dit gedrag verandert. Elke route is één keer gemeten (n=1).

## Reproduceren

Maak de plugin met de `SKILL.md` uit "Opzet" in `/tmp/exo-model-probe/plugin/skills/probe/`, ga naar een lege git-repo `/tmp/exo-model-probe/work` en draai beide commando's uit "Opzet" met de twee omgevingsvariabelen. Lees het model per aanroep uit het transcript:

```
node -e 'for (const l of require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)) { const j = JSON.parse(l); if (j.type === "assistant") console.log(j.timestamp, j.message.model) }' ~/.claude/projects/-private-tmp-exo-model-probe-work/<sessie>.jsonl
```
