# watch: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## aie-round1
- Task 1: a fixture with `language: 'ar'` and an original `en` format picks `en-orig`.

## brief
- Each launcher SKILL.md holds `context: fork` (Task 11).

## watch-rate-limit
- Een batch waarvan de eerste video op beide routes een 429 krijgt, start geen tweede video en eindigt met exit 75 (Task 3).
- Een geslaagde probe na een trip hervat de batch (Task 3).
- Een 403 of 5xx trekt de breaker niet (Task 2).
- `list.mjs`, `search.mjs` en spec-search delen één classificatie (Tasks 1, 2, 4).
- De SKILL-regel en de `--help`-tekst noemen exit 75 en het herstartcommando (Tasks 3, 5).
- Alles samen: het Success criterion.
