Sneller: nee. Goedkoper: nee. 20 s blijft de standaard, want de mediane wandkloktijd (+2,8%) en de mediane kosten (-2,7%) vallen binnen de spreiding van n=3, en bij beide weigeringen ging de build-task door met zijn eigen test en maakte hij de taak af.

# Benchmark suite-guard: exo v0.76.0 (cac9a84e) tegen de branch subagent-suite-guard (115f1af5), 2026-10-03

Dit rapport vergelijkt v0.76.0 (`old`, `.worktrees/bench-old`) met de branch-tip 115f1af5 (`new`, `.worktrees/bench-new`) op dezelfde taak. Elke run begint met een warm-up `npm test` in de hoofdsessie, draait dan `/exo:build` op `docs/plans/business-invoices.md` en sluit af met `exo:verify`, op de TypeScript-fixture met vijf plantaken en het nieuwe plan (`--plan new`). Elke versie draaide drie keer, afwisselend van 01-old tot en met 06-new. De run-mappen staan in `/Users/thomash/bench-runs/suite-guard-2/`.

Elk getal noemt zijn bron. `metrics.json` staat in `/Users/thomash/bench-runs/suite-guard-2/` (zie "Reproduceren"); `meta.json`, `stdout.json`, `suite-runs.jsonl` en `exo-settings.txt` staan per run in `/Users/thomash/bench-runs/suite-guard-2/<run>/`, en `runtimes.json` per run in `/Users/thomash/bench-runs/suite-guard-2-heavy/<run>/`. De transcripten staan onder `~/.claude/projects/-Users-thomash-bench-runs-suite-guard-2-<run>-repo/`, en de slaapstand komt uit `pmset -g log` van deze Mac.

Verschillen zijn berekend uit de medianen als `(nieuw - oud) / oud x 100`. Voorbeeld voor de wandkloktijd: `(392,0 - 381,5) / 381,5 x 100 = +2,8%`.

Een eerdere meting op 097ac6f5 (2026-10-02, `/Users/thomash/bench-runs/suite-guard/`) mat een build waarvan de guard nooit een duur kende: de warm-up `time npm test` gold daar niet als volledige suite, dus de guard liet alles door en weigerde nul keer. Commit 115f1af5 legt de duur van zo'n verpakte suite-run wel vast. Deze herhaling vervangt die meting.

## Hoofdtabel per versie

Mediaan met spreiding (min-max) over n=3 runs per versie.

| Meting | Oud: mediaan (min-max) | Nieuw: mediaan (min-max) | Verschil mediaan | Bron |
|---|---|---|---|---|
| Wandklok totaal (s) | 381,5 (324,2-1320,9) | 392,0 (319,6-676,7) | +2,8% | meta.json `wallMs` |
| Kosten totaal (USD) | 1,3627 (1,2315-1,5955) | 1,3262 (1,2762-1,5318) | -2,7% | stdout.json `total_cost_usd` |
| Tokens totaal (M) | 1,82 (1,57-2,14) | 1,84 (1,61-2,11) | +1,0% | metrics `totalTokens` |
| Volledige suite-runs in het log, incl. warm-up | 3 (2-4) | 2 (2-3) | -33% | suite-runs.jsonl, regels met `full:true` (gelijk aan metrics `fullSuiteRunsLog`) |
| Volledige suite-runs buiten de warm-up | 2 (1-3) | 1 (1-2) | -50% | idem min 1; de warm-up is de eerste `full:true`-regel, uit de hoofdsessie |
| Volledige suite-runs door subagents (uitgevoerd) | 0 (0-1) | 0 (0-0) | n.v.t. | transcripten, zie "Volledige suite-runs per agenttype"; de ene is de reviewer van 01-old |
| Guard-weigeringen | 0 (0-0) | 1 (0-1) | n.v.t. | metrics `suiteGuardRefusals` |

Bij n=3 zijn de medianen gevoelig voor de twee runs die de slaapstand van de Mac heeft opgerekt, 01-old en 02-new (zie "Slaapstand tijdens de meting"). Zonder die twee liggen de wandkloktijden dicht bij elkaar: oud 324,2 en 381,5 s, nieuw 319,6 en 392,0 s. De verschillen in wandklok, kosten en tokens vallen ruim binnen de spreiding van elke versie, dus deze meting toont geen winst in tijd of geld.

## Per run

| Run | Versie | Wand (s) | Kosten USD | Tokens M | Suite-runs log incl. (excl.) warm-up | Weigeringen | Suiteduur warm-up (s) | `subagent_suite_after_seconds` |
|---|---|---|---|---|---|---|---|---|
| 01-old | v0.76.0 | 1320,9 | 1,5955 | 2,14 | 4 (3) | 0 | 32,5 | bestaat niet in v0.76.0 |
| 02-new | branch | 676,7 | 1,2762 | 1,61 | 2 (1) | 1 | 174,8 | 20 |
| 03-old | v0.76.0 | 324,2 | 1,2315 | 1,57 | 2 (1) | 0 | 32,6 | bestaat niet |
| 04-new | branch | 319,6 | 1,3262 | 1,84 | 2 (1) | 1 | 32,5 | 20 |
| 05-old | v0.76.0 | 381,5 | 1,3627 | 1,82 | 3 (2) | 0 | 32,3 | bestaat niet |
| 06-new | branch | 392,0 | 1,5318 | 2,11 | 3 (2) | 0 | 32,4 | 20 |

Bronnen: meta.json `wallMs`, stdout.json `total_cost_usd`, metrics `totalTokens`, suite-runs.jsonl en metrics `suiteGuardRefusals`. De suiteduur is de laatste `duration_ms` in het tool-resultaat van de warm-up in het hoofdtranscript. De grens komt uit `exo-settings.txt`, regel "Subagent test runs: Over twenty seconds (subagent_suite_after_seconds = 20, project)", die alleen in de nieuwe runs staat. Alle zes runs eindigden met exitcode 0 en zonder timeout (`meta.json`, `/Users/thomash/bench-runs/suite-guard-2-progress.log`).

## Suiteduur tegen de grens van 20 s

In vijf van de zes runs duurt de suite 32,3-32,6 s (`duration_ms` van de warm-up), ruim boven de standaardgrens van 20 s. Een subagent die de hele suite start, hoort dus geweigerd te worden. De 174,8 s van 02-new is niet de suite zelf maar de slaapstand: de warm-up liep van 08:15:36 tot 08:18:32Z, midden in het slaapvenster (zie "Slaapstand tijdens de meting"). `runtimes.json` van 02-new legde daarom 175,409 s vast.

De guard kende in alle drie de nieuwe runs de duur voordat de eerste subagent startte. Bron: `durations` in `runtimes.json`, vergeleken met suite-runs.jsonl en de Agent-aanroepen in het hoofdtranscript.

| Run | `npm test` in runtimes.json | Vastgelegd om | Eerste build-task gestart | Eerste taaktest (suite-runs.jsonl) |
|---|---|---|---|---|
| 02-new | 175,409 s | 08:18:32Z | 08:22:01Z | 08:22:39Z |
| 04-new | 33,159 s | 08:33:02Z | 08:33:24Z | 08:33:26Z |
| 06-new | 33,177 s | 08:44:44Z | 08:45:08Z | 08:45:10Z |

De `time`-prefix van de warm-up, die de guard in de eerdere meting blind maakte, is op deze branch geen probleem meer: `wholeSuiteKeys("time npm test 2>&1 | tail -20")` geeft `["npm test"]`.

## Volledige suite-runs per agenttype

Een Node-script scande elke Bash-`tool_use` in het hoofdtranscript `<sessionId>.jsonl` en in elk subagent-transcript onder `<sessionId>/subagents/agent-*.jsonl`; het agenttype komt uit het bijbehorende `*.meta.json` (`agentType`). Als kandidaat telde elk `npm test`, `npm run test` of `node scripts/test.mjs` zonder `tests/`- of `.test.ts`-argument in hetzelfde commandosegment, plus elk tool-resultaat met `may not run the whole test suite`. Daarna is elke `full:true`-regel in suite-runs.jsonl op tijdstempel gekoppeld aan het Bash-venster (aanroep tot resultaat) dat hem startte. Zo telt ook de verify-gate mee, die de suite via `skills/verify/scripts/verify.mjs` start en die een tekstscan alleen zou missen. Een geweigerde poging staat niet in suite-runs.jsonl, omdat de hook het commando tegenhoudt voordat het draait.

| Run | Hoofdsessie (warm-up + gate/regate) | exo:build-task | exo:fix-review | exo:review-branch / exo:review-branch-deep | Overig |
|---|---|---|---|---|---|
| 01-old | 1 + 2 (gate 07:56:11, regate 08:14:14) | 0 | 0 | 1 (review-branch-deep, 07:57:55) | 0 |
| 02-new | 1 + 1 (gate 08:24:58) | 0 uitgevoerd, 1 geweigerd | niet gedispatcht | 0 | 0 |
| 03-old | 1 + 1 (gate 08:30:05) | 0 | niet gedispatcht | 0 | 0 |
| 04-new | 1 + 1 (gate 08:35:40) | 0 uitgevoerd, 1 geweigerd | niet gedispatcht | 0 | 0 |
| 05-old | 1 + 2 (gate 08:40:52, regate 08:42:57) | 0 | 0 | 0 | 0 |
| 06-new | 1 + 2 (gate 08:47:03, regate 08:49:35) | 0 | 0 | 0 | 0 |

Per versie opgeteld, buiten de warm-up: oud 7 volledige suite-runs, waarvan 6 door de hoofdsessie (gate en regate) en 1 door de reviewer van 01-old; nieuw 4, allemaal door de hoofdsessie. In alle runs koos build de directe route met vijf `exo:build-task`-subagents, zonder `exo:run-unit`. De reviewer was steeds `exo:review-branch-deep`, omdat taak 1 `Risk: public signature` draagt; `exo:review-branch` kwam niet voor. Alle volledige suite-runs liepen in de hoofdmap `repo`, geen enkele in een taakmap `repo-task-N`.

Het lagere aantal volledige suite-runs in de nieuwe versie komt vooral doordat de nieuwe runs minder vaak een regate na een fixronde nodig hadden, en doordat de reviewer van 01-old de suite draaide. Het komt niet van de guard: in de oude runs draaide geen enkele build-task de suite.

## Guard-weigeringen

Er zijn twee weigeringen, in de transcripten herkenbaar aan de tekst van `hooks/guards/suite-guard.mjs` (`may not run the whole test suite`). Dat aantal klopt met metrics `suiteGuardRefusals` (02-new 1, 04-new 1, 06-new 0). Beide kwamen van de `exo:build-task` van taak 5, die de hele suite achter zijn eigen test plakte.

1. 02-new, `exo:build-task` "Build Task 5 shipping split" (`agent-afd6ed821504c0457`), 08:24:28Z. Het geweigerde commando was één Bash-aanroep met een python3-heredoc die `src/order.ts` en `src/invoice.ts` aanpaste, een `cat > tests/invoice-shipping.test.ts`-heredoc, en daarna `npm test -- tests/invoice-shipping.test.ts 2>&1 | tail -30; npm test 2>&1 | tail -8; npm run typecheck 2>&1 | tail`. De melding noemde "its last run in this project took 175 s, over subagent_suite_after_seconds (20 s)". De subagent draaide daarna `git status --short` (leeg), schreef "Nothing ran. I'll rerun the same edits without the full suite." en voerde om 08:24:38 dezelfde bewerkingen uit met alleen `npm test -- tests/invoice-shipping.test.ts`, die slaagde. Om 08:24:44 meldde hij "Task 5: GREEN", 16 s na de weigering, zonder nieuwe poging op de suite.
2. 04-new, `exo:build-task` "Build Task 5 shipping" (`agent-a9e283b50871f98c2`), 08:35:12Z. Het geweigerde commando was een `cat > tests/invoice-shipping.test.ts`-heredoc, gevolgd door `npm test -- tests/invoice-shipping.test.ts 2>&1 | tail -25; npm test 2>&1 | tail -12`. De melding noemde "its last run in this project took 33 s, over subagent_suite_after_seconds (20 s)". De subagent draaide daarna `ls tests/invoice-shipping.test.ts; npm test -- tests/invoice-shipping.test.ts` en zag dat het bestand niet bestond. Hij schreef "The hook blocked the whole command, so the file was never written. I'll write it again.", schreef het bestand opnieuw met Write en draaide `npm test -- tests/invoice-shipping.test.ts`, die slaagde. Om 08:35:26 meldde hij "Task 5: GREEN", 14 s na de weigering.

De guard weigert de hele Bash-aanroep, dus ook de bestandsbewerkingen die ervoor in hetzelfde commando staan. In 04-new is het testbestand daardoor nooit geschreven, en in 02-new zijn de bewerkingen van `src/order.ts` en `src/invoice.ts` evenmin uitgevoerd. Beide subagents merkten dat zelf en deden de bewerking opnieuw. Geen subagent bleef steken op een weigering, er was geen herhaallus, en alle subagent-transcripten eindigen met een eindrapport.

## Slaapstand tijdens de meting

Twee runs zijn opgerekt door de slaapstand van de Mac, niet door exo. Volgens `pmset -g log` ging het scherm om 09:59:13 lokale tijd uit ("Display is turned off") en ging de Mac om 09:59:18 lokaal (07:59:18Z) in `Idle Sleep`. Tot de volledige `Wake` om 10:24:03 lokaal (08:24:03Z) wisselde hij tussen `Maintenance Sleep` en korte `DarkWake`s van 10 tot 20 s. Of er toen een `caffeinate` liep, is niet nagezocht; de slaap zelf staat vast in het log.

- 01-old duurde 1320,9 s, waarvan 905,6 s fixfase (metrics `phases.fix`). `exo:fix-review` (`agent-af54f61fe6034c208`) startte om 07:59:19Z twee gerichte tests van elk ongeveer 50 ms, één seconde na het begin van de slaap. Het resultaat kwam pas bij de DarkWake om 08:09:13Z terug, met de melding dat het commando "did not complete within its 120s timeout and was moved to the background". Om 08:09:30Z sliep de Mac weer tot 08:13:48Z, en daarna rondde fix-review in 7 s af ("fixed=2 reported=2"). Ongeveer 14,5 min van de fixfase is slaap.
- 02-new had een buildfase van 555,6 s (metrics `phases.build`, met de warm-up erin) tegen 2,8-3,1 min in de andere runs. Twee stukken vallen in het slaapvenster: de warm-up van 175 s (normaal 33 s) en een gat van 08:18:41 tot 08:21:54Z tussen twee opeenvolgende Bash-aanroepen, dat samenvalt met `Maintenance Sleep` van 10:18:40 tot de DarkWake om 10:21:51 lokaal. Ongeveer 335 s van de 676,7 s wandklok is daarmee slaap.

Beide runs zijn daardoor de maxima van hun versie, wat de spreiding van de wandklok vergroot. De beslissing van de guard in 02-new hangt niet af van de opgeblazen 175 s: met de normale 33 s had hij ook geweigerd, zoals 04-new laat zien; alleen de tekst van de melding verschilt. Draai een volgende meting onder `caffeinate -i`, zodat de Mac tijdens de serie niet in `Idle Sleep` gaat, en controleer daarna `pmset -g log` op slaap binnen het meetvenster.

## Bevindingen voor een vervolg

`wholeSuiteKeys` in `lib/runtime-log.mjs` ziet ook `ls tests` en `npm run lint` als volledige suite. `runtimes.json` van 02-new bevat naast `npm test` ook `ls tests` (0,021 s) en `npm lint` (6,389 s), en 04-new en 06-new bevatten ook `ls tests`. Op de branch nagegaan:

```
"ls tests"                       -> ["ls tests"]
"npm run lint"                   -> ["npm lint"]
"time npm test 2>&1 | tail -20"  -> ["npm test"]
"npm test -- tests/tax.test.ts"  -> []
```

De oorzaak is `TEST_LIKE = /test|e2e|\bcheck(?!out)|lint|verify/` (`lib/runtime-log.mjs:29`), dat het losse woord `tests` en `lint` treft. In deze meting had dat geen gevolg, omdat beide duren onder de 20 s liggen. Bij een lint van meer dan 20 s zou de guard een subagent die lint draait wel weigeren, met een melding over de hele testsuite.

`metrics.json` meldt `fullSuite.warmUp: 0` in alle zes runs, terwijl elke run een warm-up heeft (`time npm test 2>&1 | tail -N`, de eerste `full:true`-regel in suite-runs.jsonl). De warm-up is daarom met de hand van het log afgetrokken in de regels "buiten de warm-up" hierboven. Waarom `benchmarks/lean-gates-metrics.mjs` de warm-up mist, is niet uitgezocht.

## Reproduceren

Per run, via `/Users/thomash/bench-runs/run-all-2.sh` vanuit `.worktrees/subagent-suite-guard`, eerst runs 1-2 en daarna 3-6 achter elkaar:

```
EXO_HEAVY_CACHE=/Users/thomash/bench-runs/suite-guard-2-heavy/<NN-arm> node benchmarks/lean-gates.mjs --version <old|new> --plan new --run <n> --out /Users/thomash/bench-runs/suite-guard-2 --timeout-min 30
```

De bench-worktrees:

```
git worktree add --detach .worktrees/bench-old cac9a84e
git worktree add --detach .worktrees/bench-new 115f1af5
```

De metrics, die `/Users/thomash/bench-runs/suite-guard-2/metrics.json` schrijven:

```
node benchmarks/lean-gates-metrics.mjs /Users/thomash/bench-runs/suite-guard-2 --no-recheck
```

Model `claude-opus-5-5`, effort `medium`, budget 30 USD per run (`meta.json` `argv`). Slaapstand: `pmset -g log`, venster 09:59-10:24 lokale tijd (+0200).
