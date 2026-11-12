# Een rate-limit stopt de batch en blijft zichtbaar

## Goal

Een rate-limited externe dienst kan een batch niet meer alle items laten proberen, zonder duidelijke eindstatus laten eindigen, of als afgehandeld laten melden terwijl er niets draait.

## Verdict

Verdict: go
Objection: wachten haalt een YouTube-blokkade misschien niet weg (een bron meldt dat slapen niet hielp zodra de 429's begonnen, en de enige gevonden blokduur van 30 tot 60 minuten is niet geverifieerd), dus elke wachttijd is begrensd en eindigt in een eigen exitcode; en `skills/spec/scripts` heeft al een host-breaker (`host-state.mjs`, opent na 3 opeenvolgende 429/5xx voor 60 s), dus een tweede breaker zou dubbel werk zijn.

## Decisions

1. Eén gedeelde module houdt de rate-limit-classificatie en de breaker-toestand voor uitgaande verzoeken; de watch-scripts (`transcript.mjs` batch, `list.mjs`, `skills/watch/scripts/search.mjs`) en de spec-search gebruiken die ene module, geen tweede implementatie. Het gedrag van spec-search blijft zoals zijn tests het vastleggen. (exo decided)
2. De classificatie scheidt 429 van 403 en 5xx: `request-gate.mjs:11` labelt nu alle drie "rate-limited, retry later". Alleen een 429 trekt de watch-breaker; een ontbrekend bijschrift, een 403 of een 5xx nooit. (exo decided)
3. De batch trekt de breaker wanneer één video op beide routes (directe fetch en yt-dlp, elk al herhaald) op een rate-limit faalt. Na de trip start hij geen video meer. (exo decided)
4. Na een trip wacht de batch en probeert hij met de eerste open video, met een verdubbelende wachttijd, tot één nieuwe overschrijfbare standaardwaarde `EXO_WATCH_RATE_WAIT_MS` (via `environmentMs`, standaard 3600000, uit de 30 tot 60 minuten) op is; `0` betekent direct stoppen. Een geslaagde probe hervat de batch. Er komt hooguit deze ene nieuwe waarde bij; de probe-wachttijd volgt uit een bestaande waarde. (exo decided)
5. Is de wachttijd op, dan eindigt het script met exit 75 en houdt de laatste stdout-regel de bestaande batchvorm, met erbij het aantal open video's, de status `rate-limited` en het exacte herstartcommando. Open video's tellen niet als mislukt. `done.jsonl` zorgt er al voor dat een herstart alleen onafgemaakte video's oppakt (`tests/watch-batch.test.mjs:119`). (exo decided)
6. Elke toestandswisseling (getript, probe n van de wachttijd, hervat) schrijft één regel naar stderr, zodat een logstaart laat zien dat de batch leeft. (exo decided)
7. `skills/watch/SKILL.md:41` (en `:37`, `:39` waar ze botsen) wordt vervangen door de regel die uit de code volgt: draai een batch van twee of meer video's op de achtergrond, geef de laatste batchregel ongewijzigd door, en meld bij exit 75 het aantal open video's en het herstartcommando. De `--help`-tekst en de exitcodelijst van `transcript.mjs` volgen. (exo decided)
8. Tests: hooguit één nieuwe test per oorzaak, eerst rood gezien, met de stubs die het feitenbestand noemt (`EXO_YTDLP`-stub met `FAKE_FAILURES`, geïnjecteerde fetch, `tests/watch-gate-env.mjs` met vertragingen op 0): de batch stopt na de eerste rate-limited video en eindigt met 75 en het aantal open; een geslaagde probe hervat de batch; een 403 trekt de breaker niet. (exo decided)
9. Buiten bereik: cookies, proxy's, yt-dlp sleep-vlaggen, een wijziging van de per-host gate, en `skills/research/`, dat niet bestaat. (exo decided)
10. Landing: lokaal, squash naar `main` volgens `.claude/landing.md`; er wordt niets gevraagd over waar te committen. Elke plantaak gebruikt `Land gate: npm run validate:static`; `npm run check` draait één keer als Success criterion en eindigt met `SUMMARY` met `FAIL=0 WARN=0 UNRUN=0`. Eén taak voegt één regel toe onder `## Unreleased`, `### Fixed` in `CHANGELOG.md`. (exo decided)

## Non-goals

- Cookies, proxy's en yt-dlp sleep-vlaggen: `skills/watch/scripts/ytdlp.mjs`, `skills/watch/scripts/watch.mjs`.
- Een wijziging van de per-host gate: `skills/watch/scripts/request-gate.mjs` (alleen de classificatie, niet het spacing-slot).
- `skills/research/`: bestaat niet.
- De bewering van een lead dat een agent iets afhandelt: de laatste scriptregel en exit 75 dragen de ware toestand, en er komt geen hook voor de woorden van een lead.
- De downloads van de yt-dlp-binary en van de decoder en het whisper-model: een download draait één keer per machine, niet één keer per video.

## Open points

None.

## Assumptions

- [code] Een mislukte video heet nu alleen `{status:'failed', failure}` en de lus in `skills/watch/scripts/batch.mjs:20-28` kent geen vroege stop (skills/watch/scripts/batch.mjs:20).
- [code] `done.jsonl` laat een herstart alleen video's zonder ledger-regel oppakken (tests/watch-batch.test.mjs:119).
- [assume] `list.mjs` en `search.mjs` krijgen geen wachttijd: ze gebruiken de gedeelde classificatie en eindigen bij een 429 met exit 75 en de bestaande foutregel, omdat één aanroep daar geen batch is.
- [assume] De gedeelde module staat in `lib/outside-limit.mjs`, naast `lib/script-flags.mjs`, omdat watch en spec haar allebei importeren.
- [assume] De mensenregel `rate-limited, retry later` blijft voor 403, 429 en 5xx gelijk; de scheiding zit in een boolean op het falen, niet in een andere tekst.
- [assume] De gedeelde breaker is in-memory per proces; de bestandsgebonden toestand van `host-state.mjs` blijft die van spec-search en gebruikt voor classificatie dezelfde module.
- [code] `en-orig` onder `--lang en` → `pickCaptions` roept `trackKey(info.automatic_captions, 'en', true)` aan; die geeft `en-orig` terug wanneer die sleutel bestaat omdat `preferOriginal` aan staat, en dat is dezelfde taal, geen ander (skills/watch/scripts/ytdlp-info.mjs:15). De foutregel plakt die sleutel erin (skills/watch/scripts/watch.mjs:81). Geen defect.
- [code] Binary- en decoder-downloads en een 429 → de yt-dlp-binary wordt in de code niet meer gedownload: `resolveYtDlp` geeft `{command: null}` zonder PATH of `EXO_YTDLP` (skills/watch/scripts/ytdlp-binary.mjs:27), terwijl de helptekst nog een download noemt (skills/watch/scripts/options.mjs:11). De whisper-modeldownload gooit bij elke niet-ok status, dus ook 429, zonder herhaling (skills/watch/scripts/whisper-model.mjs:35). De decoder gaat via `npm install` zonder eigen 429-afhandeling (skills/watch/scripts/decoder.mjs:65).

## Acceptance

- Een batch waarvan de eerste video op beide routes een 429 krijgt, start geen tweede video en eindigt met exit 75 (Task 3).
- Een geslaagde probe na een trip hervat de batch (Task 3).
- Een 403 of 5xx trekt de breaker niet (Task 2).
- `list.mjs`, `search.mjs` en spec-search delen één classificatie (Tasks 1, 2, 4).
- De SKILL-regel en de `--help`-tekst noemen exit 75 en het herstartcommando (Tasks 3, 5).
- Alles samen: het Success criterion.

## Manual checks

- Draai een batch van minstens twee video's terwijl YouTube je blokkeert: je ziet op de scherm-log een regel "getript" en daarna regels met het wachten, en geen tweede video wordt gestart.
- Wacht tot de tijd op is of zet `EXO_WATCH_RATE_WAIT_MS=0`: de laatste regel noemt het aantal open video's, `rate-limited` en het commando om opnieuw te starten, en het script eindigt met code 75.

## Plan basis

Repository: /Users/thomash/Documents/Code/personal/plugins/exo
Branch: fix/watch-rate-limit
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: fix(watch): stop a batch on a rate limit and end in exit 75
Lint: none
Allow: none

## Success criterion

`npm run check`
Red: none (each task Proof proves its own red)
Product run: none (the batch needs a live rate-limited service; its tests drive the same script with stubs)

## Checkpoint

- Blocks first: Task 1.
- Parallel: Tasks 2, 3 and 4.
- Shared state: Task 3 and Task 4 both read `lib/outside-limit.mjs`; `tests/watch-gate-env.mjs` is written by Task 3 only.
- Smallest safe split: one task per module, each with its own test.

## Tasks

### Task 1: feat(lib): add one outside-limit module with 429 classification and a breaker

Depends on: none | Files: `lib/outside-limit.mjs`, `tests/outside-limit.test.mjs`, `docs/behaviour/watch.md` | Data: a pure classifier from status or yt-dlp text to rate-limited, refused, server or other, and an in-memory breaker object | Proof: node --test tests/outside-limit.test.mjs

### Task 2: fix(watch): mark only a 429 as rate-limited in the request gate

Depends on: 1 | Files: `skills/watch/scripts/request-gate.mjs`, `skills/watch/scripts/youtube.mjs`, `tests/watch-request-gate.test.mjs` | Data: a rateLimited boolean on the failure object, true only for 429 | Proof: node --test tests/watch-request-gate.test.mjs

### Task 3: fix(watch): stop a batch on a rate limit, probe, resume or exit 75

Depends on: 1, 2 | Files: `skills/watch/scripts/batch.mjs`, `skills/watch/scripts/transcript.mjs`, `skills/watch/scripts/defaults.mjs`, `tests/watch-gate-env.mjs`, `tests/watch-batch.test.mjs`, `skills/watch/scripts/options.mjs`, `skills/watch/scripts/request-gate.mjs`, `tests/watch-request-gate.test.mjs`, `tests/watch-retry.test.mjs` | Data: an open outcome status next to done, skipped and failed, counted apart from failed | Proof: node --test tests/watch-batch.test.mjs

### Task 4: fix(watch): classify list and search failures through the shared module

Depends on: 1, 2 | Files: `skills/watch/scripts/list.mjs`, `skills/watch/scripts/listing.mjs`, `skills/watch/scripts/search.mjs`, `skills/spec/scripts/sources/host-state.mjs`, `tests/watch-list.test.mjs`, `tests/watch-search.test.mjs`, `tests/research-host-state.test.mjs`, `tests/search-args.test.mjs` | Data: the same classifier result on the list, search and spec host-state paths | Proof: node --test tests/watch-list.test.mjs tests/watch-search.test.mjs tests/research-host-state.test.mjs tests/search-args.test.mjs

### Task 5: fix(watch): state the batch rate-limit rule in the skill

Depends on: 3 | Files: `skills/watch/SKILL.md`, `skills/watch/scripts/list-options.mjs` | Data: the loop steps 1 and 3 text of the skill | Evidence: none (the rule restates the exit code of Task 3 and gets no benchmark of its own) | Proof: grep -q "exit 75" skills/watch/SKILL.md

### Task 6: fix(changelog): note the rate-limit stop of a watch batch

Depends on: 3 | Files: `CHANGELOG.md`, `skills/watch/scripts/batch.mjs` | Data: one line under Unreleased, Fixed | Proof: grep -q "EXO_WATCH_RATE_WAIT_MS" CHANGELOG.md
