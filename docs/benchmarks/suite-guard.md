Doet de suite-guard iets? Niet in deze meting: de guard weigerde nul keer, en dat komt doordat hij nooit een duur kende, niet doordat subagents de suite meden (mediane wandkloktijd -4,2%, mediane total_cost_usd +3,0%, mediane volledige suite-runs buiten de warm-up 2 tegen 2). Zie "Waarom de guard nooit afging".

# Benchmark suite-guard: exo v0.76.0 (cac9a84e) tegen de branch subagent-suite-guard (097ac6f5), 2026-10-02

Dit rapport vergelijkt v0.76.0 (`old`) met de branch na taak 1-8 (`new`) op dezelfde taak: `/exo:build` gevolgd door `exo:verify` op de TypeScript-fixture met vijf plantaken, beide met het nieuwe plan (`--plan new`, `benchmarks/lean-gates/plans/new.md`). Elke versie draaide drie keer, afwisselend 01-old tot 06-new. De run-mappen staan in `/Users/thomash/bench-runs/suite-guard/`. Elk getal noemt zijn bron: `node benchmarks/lean-gates-metrics.mjs /Users/thomash/bench-runs/suite-guard --no-recheck` (de `fatal: path ... not in`-regels op stderr zijn onschuldig), `meta.json`, `stdout.json`, `suite-runs.jsonl` en de transcripten onder `~/.claude/projects/-Users-thomash-bench-runs-suite-guard-<run>-repo/`.

Verschillen zijn berekend uit de medianen als `(nieuw - oud) / oud x 100`. Voorbeeld voor de wandkloktijd: `(415,6 - 433,8) / 433,8 x 100 = -4,2%`.

## Hoofdtabel per versie

Mediaan met spreiding (min-max) over n=3 runs per versie.

| Meting | Oud: mediaan (min-max) | Nieuw: mediaan (min-max) | Verschil mediaan | Bron |
|---|---|---|---|---|
| Wandklok totaal (s) | 433,8 (309,7-3910,0) | 415,6 (339,0-430,1) | -4,2% | meta.json `wallMs` |
| Wandklok zonder 05-old (s) | 371,8 (309,7-433,8) | 415,6 (339,0-430,1) | +11,8% | idem, gemiddelde van twee oude runs |
| Kosten totaal (USD) | 1,3519 (1,3342-1,4919) | 1,3926 (1,3349-1,5037) | +3,0% | stdout.json `total_cost_usd` |
| Tokens totaal (M) | 1,96 (1,87-2,13) | 1,75 (1,73-2,20) | -10,7% | metrics `totalTokens`, afgerond |
| Volledige suite-runs in het log, incl. warm-up | 3 (2-3) | 3 (3-5) | 0% | metrics `fullSuiteRunsLog` (suite-runs.jsonl) |
| Volledige suite-runs buiten de warm-up | 2 (1-2) | 2 (2-4) | 0% | idem min 1, de warm-up is de eerste `full:true`-regel |
| Volledige suite-runs door build-task of fix-review | 0 (0-0) | 0 (0-0) | n.v.t. | transcripten van alle subagents, zie onder |
| Volledige suite-runs door review-branch-deep | 0 (0-0) | 0 (0-1) | n.v.t. | idem; de ene is 04-new |
| Guard-weigeringen | 0 (0-0) | 0 (0-0) | n.v.t. | metrics `suiteGuardRefusals` |

De "zonder 05-old"-regel vergelijkt een gemiddelde van twee oude runs met een mediaan van drie nieuwe en is alleen indicatief. De suite zelf duurt 32-33 s (`duration_ms` in de testuitvoer van 02-new, 04-new en 06-new), dus boven de standaardgrens van 20 s.

## Per run

| Run | Versie | Wand (s) | Kosten USD | Tokens M (hoofd/sub) | Suite-runs log (excl. warm-up) | Weigeringen | Fixrondes |
|---|---|---|---|---|---|---|---|
| 01-old | v0.76.0 | 309,7 | 1,3519 | 1,87 (1,40/0,47) | 1 | 0 | 0 |
| 02-new | branch | 415,6 | 1,5037 | 2,20 (1,50/0,70) | 2 | 0 | 1 |
| 03-old | v0.76.0 | 433,8 | 1,4919 | 1,96 (1,31/0,65) | 2 | 0 | 1 |
| 04-new | branch | 430,1 | 1,3926 | 1,73 (1,10/0,62) | 4 | 0 | 1 |
| 05-old | v0.76.0 | 3910,0 | 1,3342 | 2,13 (1,76/0,37) | 2 | 0 | 0 |
| 06-new | branch | 339,0 | 1,3349 | 1,75 (1,20/0,54) | 2 | 0 | 0 |

Alle zes runs eindigden met exitcode 0, zonder timeout, en landden taken 1-5. Alle volledige suite-runs in suite-runs.jsonl draaien in de hoofdmap `repo` (hoofdsessie, verify, reviewer); geen enkele komt uit een taakmap `repo-task-N`.

## Volledige suite-runs per agenttype

Ik scande de Bash-aanroepen in het hoofdtranscript en in elk subagent-transcript (agenttype uit `*.meta.json`) op `npm test` zonder bestandsargument. Dat dekt het commando dat de fixture gebruikt; een ander commando zou deze scan missen.

- Hoofdsessie: in elke run de warm-up (`time npm test 2>&1 | tail -N`), verder de verify-gate.
- `exo:build-task` en `exo:fix-review`: in geen enkele run, oud noch nieuw, een volledige suite. Hun Proof was telkens één testbestand (suite-runs.jsonl toont `tests/tax.test.ts` e.d. met `full:false` vanuit `repo-task-N`).
- `exo:review-branch-deep`: 04-new draaide `git status --short; npm test 2>&1 | tail -15` (18:12:31) en kreeg de suite-uitvoer terug, dus niet geweigerd.

Op deze taak met dit plan deden de subagents dus al vóór de guard geen volledige suite. De guard had hier niets weg te nemen, behalve de ene reviewer-run.

## Waarom de guard nooit afging

De ene reviewer-run in 04-new had geweigerd moeten worden: de suite duurt 32 s, de grens is 20 s en `exo-settings.txt` toont `subagent_suite_after_seconds = 20`. Dat gebeurde niet. De warm-up in alle zes runs was `time npm test 2>&1 | tail -N`. Op de branch geeft `wholeSuiteKeys` voor dat commando `[]` terug, omdat `time` geen launcher is: het commando geldt niet als volledige suite en `recordFinish` bewaart er geen duur voor. Zonder bekende duur laat de guard de eerste run door (beslissing "een sleutel zonder duur slaagt"). Voor `git status --short; npm test 2>&1 | tail -15` geeft dezelfde functie wel `["npm test"]`. Gecontroleerd met `wholeSuiteKeys` uit `lib/runtime-log.mjs` op de branch. Ik heb niet onderzocht of de reviewer-run zelf een duur zou hebben vastgelegd; het log `~/.cache/exo/heavy/runtimes.json` van deze runs is niet bewaard per run.

Gevolg: deze benchmark meet niet of de guard werkt, maar dat een warm-up met `time` hem uitschakelt. Dat is een bevinding over de recognition, buiten de bestanden van deze taak (`lib/runtime-log.mjs`, `LAUNCHERS`).

## Uitbijter 05-old

05-old duurde 3910 s (65,2 min) tegen 310-434 s voor de andere vijf, en miste de verify-fase en reviewfase. Het is geen timeout (`timedOut: false`, exitcode 0, limiet 110 min) en geen fout van de harness: `duration_api_ms` is 285 s. Uit het hoofdtranscript:

1. 18:19:50 startte verify de gate; die liep na 10 minuten in de 600 s-timeout en ging naar de achtergrond.
2. De hoofdsessie zag `tests/invoice.test.ts` meer dan 15 minuten hangen, een synchrone oneindige lus (de 60 s-testtimeout vuurde niet). Dat bestand komt uit de code van taak 5 in deze run. Reproductie met een apart script hing niet: 130 gevallen liepen door.
3. Daarna zitten twee gaten van 13 en 16 minuten tussen opeenvolgende transcriptregels (18:51:49 tot 19:04:19 en 19:04:24 tot 19:20:16) zonder commando of tekst. De oorzaak staat niet in het transcript.
4. De run eindigde 19:20:25 met de zin dat de gate opnieuw in de achtergrond draaide; er is geen verify-uitkomst.

De hang zit in code die het model schreef, niet in een guard: v0.76.0 heeft die niet. Of de gaten slaap, een hangend proces of iets anders waren, is niet vast te stellen. Daarom staan de medianen hierboven mét 05-old (zo is de mediaan bedoeld robuust) en staat de regel zonder 05-old ernaast.

## Conclusie

- Wandklok: mediaan -4,2% (415,6 s tegen 433,8 s). Met n=3, spreiding 339-430 s nieuw en 310-434 s oud (05-old buiten beschouwing) is dat geen verschil.
- Kosten: mediaan +3,0%, gemiddelde +1,3% (1,4104 tegen 1,3927 USD). Binnen de ruis van de runs onderling.
- Volledige suite-runs: gelijk (mediaan 2 tegen 2 buiten de warm-up). Alleen 04-new heeft er één door een subagent.
- Weigeringen: 0. Het effect van de guard is in deze meting niet te zien, en de enige reden dat hij had kunnen werken, de reviewer in 04-new, werd niet afgevangen door de `time`-warm-up (zie hierboven).

## Reproduceren

```
node benchmarks/lean-gates-metrics.mjs /Users/thomash/bench-runs/suite-guard --no-recheck
```

De runs draaiden met `benchmarks/lean-gates.mjs --version old|new --plan new --run <n> --out /Users/thomash/bench-runs/suite-guard`, met `.worktrees/bench-old` op v0.76.0 en `.worktrees/bench-new` op 097ac6f5, model `claude-opus-5-5`, effort `medium`, budget 30 USD per run.
