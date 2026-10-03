**Niet geland.** De unit-route is niet geland, ondanks de lagere kosten hieronder. Arm 2 was in de mediaan 12,1% trager in wandklok, en de beperking van de gebruiker is tijd, niet verbruik: hun 7-daagse verbruik is slechts 3%. Bij plannen van 8 taken of minder verdwijnen bovendien de `Choice:`-regels van de bouwers, omdat `skills/build/scripts/land-task.mjs` het beslislog alleen schrijft bij plannen boven 8 taken. Arm 3 (Sonnet als hoofdsessie) scoorde blind 21 tegen 24 voor arm 1 (mediaan).

Arm 2 landt. Wanneer build elk plan via `exo:run-unit` draait, kost een run in de mediaan 1,3093 tegen 1,4670 USD (-10,7%), en elke arm-2-run (1,2010-1,3399) kostte minder dan elke arm-1-run (1,4537-1,5048). De hoofdsessie werd 38,5% goedkoper. De kwaliteit telt als gelijk: alle negen eindchecks slagen, alle 5 taken landden in elke run, er liep geen taak vast, en elke review vond precies één defect, in elke run dezelfde procesregel en geen codefout. Het mediane aantal reviewbevindingen is 2 tegen 3, en arm 2 had evenveel of minder fixrondes. De blinde score is in de mediaan wel één punt lager, 23 tegen 24, met hetzelfde bereik 22-24 en een gemiddelde van 23,0 tegen 23,3. Dat verschil valt binnen de spreiding van n=3. Sneller is arm 2 niet: de mediane wandklok was 12,1% langer, omdat de stap via run-unit een extra serieel niveau toevoegt. Arm 3, met de hoofdsessie op Sonnet, is het goedkoopst (-21,1%), maar scoort blind lager (mediaan 21, bereik 21-23), en `exo:review-branch-deep` draait daar nog steeds op Opus.

# Benchmark unit-route: exo v0.77.0 (e274f33f) op Opus en op Sonnet tegen de branch unit-route (69f33f10), 2026-10-03

Dit rapport vergelijkt drie armen op dezelfde taak. Arm 1 is main e274f33f (v0.77.0) met de hoofdsessie op `--model opus`. Build kiest daar voor een plan van 5 taken de directe route. Arm 2 is de branch `unit-route` op 69f33f10, waar `skills/build/scripts/next-task.mjs` altijd `Route: unit` print, zodat ook een plan van 8 of minder taken naar `exo:run-unit` op Sonnet gaat. De hoofdsessie draait op `--model opus`. Arm 3 is main e274f33f met de hoofdsessie op `--model sonnet`, wat de regel `/model sonnet` van exo voor de volgende stap vraagt. Elke run begint met een warm-up `npm test` in de prompt, draait dan `exo:build` op `docs/plans/business-invoices.md` en sluit af met `exo:verify`, op de TypeScript-fixture met het plan `new` (5 taken). Elke arm draaide drie keer, in de volgorde 1-2-3, drie keer herhaald, en de hele serie liep onder `caffeinate -i`. De run-mappen staan in `/Users/thomash/bench-runs/unit-route/`.

Een eerdere probe liet zien dat een `model:`-regel in de SKILL.md van build de hoofdsessie niet op Sonnet houdt (zie [skill-model-field.md](skill-model-field.md)). Daarom meet arm 3 de wissel `/model sonnet` op sessieniveau.

Elk getal noemt zijn bron. `meta.json`, `stdout.json` en `repo/.exo/branch-review.md` staan per run in `/Users/thomash/bench-runs/unit-route/<arm-map>/<run>/`, en `metrics.json` per arm in `/Users/thomash/bench-runs/unit-route/<arm-map>/`. De arm-mappen zijn `arm1-opus-direct`, `arm2-opus-unit` en `arm3-sonnet-direct`. De kosten per segment, het model per aanroep, de route en de kwaliteitstabel komen uit `/Users/thomash/bench-runs/unit-route/ANALYSIS.md` (data in `analysis.json` ernaast), die ze uit de transcripten onder `~/.claude/projects/-Users-thomash-bench-runs-unit-route-<arm-map>-<run>-repo/` haalt. De opzet, de tijden en de slaapcheck staan in `/Users/thomash/bench-runs/unit-route/RUNNER.md`. De blinde scores komen uit `/tmp/ur-blind/judgement.md`, ontblind met `/Users/thomash/bench-runs/unit-route/blind-key.txt`.

Verschillen zijn berekend uit de medianen als `(arm - arm 1) / arm 1 x 100`. Voorbeeld voor de kosten van arm 2: `(1,3093 - 1,4670) / 1,4670 x 100 = -10,7%`.

## Hoofdtabel per arm

Mediaan met spreiding (min-max) over n=3 runs per arm.

| Meting | Arm 1: Opus, direct | Arm 2: Opus, unit | Arm 3: Sonnet, direct | Arm 2 tegen 1 | Arm 3 tegen 1 | Bron |
|---|---|---|---|---|---|---|
| Wandklok (s) | 446,8 (397,6-521,9) | 500,9 (401,1-550,9) | 402,4 (360,7-417,5) | +12,1% | -9,9% | meta.json `wallMs` |
| Kosten totaal (USD) | 1,4670 (1,4537-1,5048) | 1,3093 (1,2010-1,3399) | 1,1580 (1,1434-1,2386) | -10,7% | -21,1% | stdout.json `total_cost_usd` |
| Kosten hoofdsessie (USD) | 0,8109 (0,7785-0,8146) | 0,4985 (0,4598-0,5145) | 0,5393 (0,4749-0,5748) | -38,5% | -33,5% | ANALYSIS.md "Main cost": usage van het hoofdtranscript x `benchmarks/prices.mjs` |
| API-aanroepen hoofdsessie | 35 (35-36) | 22 (21-23) | 34 (34-37) | -37,1% | -2,9% | ANALYSIS.md "Main API calls", ontdubbeld op `message.id` |
| Tokens hoofdsessie | 1.327.859 (1.304.591-1.368.128) | 669.236 (626.609-709.799) | 1.260.314 (1.224.790-1.438.894) | -49,6% | -5,1% | ANALYSIS.md "Main tokens total" |
| Kosten `exo:run-unit` (USD) | 0 | 0,1661 (0,1590-0,1686) | 0 | n.v.t. | n.v.t. | ANALYSIS.md "run-unit cost", subagents met `agentType` `exo:run-unit` |
| Kosten overige subagents (USD) | 0,6886 (0,6427-0,6902) | 0,6423 (0,5704-0,6581) | 0,6830 (0,5687-0,6993) | -6,7% | -0,8% | ANALYSIS.md "Other subagents cost" |
| Reviewbevindingen (defect+hazard+question) | 3 (2-3) | 2 (1-3) | 2 (1-3) | -33,3% | -33,3% | metrics.json `quality.reviewerReturn` |
| Review-defects | 1 (1-1) | 1 (1-1) | 1 (1-1) | 0,0% | 0,0% | idem |
| Fixrondes | 1 (1-1) | 1 (0-1) | 1 (0-1) | 0,0% | 0,0% | metrics.json `quality.fixRounds` |
| Taken geland (van 5) | 5 (5-5) | 5 (5-5) | 5 (5-5) | 0,0% | 0,0% | metrics.json `quality.landedTasks` |
| Blinde score (van 25) | 24 (22-24) | 23 (22-24) | 21 (21-23) | -1 punt (-4,2%) | -3 punten (-12,5%) | judgement.md, kolom `Sum` van "Scores", ontblind met blind-key.txt |

De kosten van arm 2 overlappen niet met die van arm 1: de duurste arm-2-run (05-new, 1,3399) kostte minder dan de goedkoopste arm-1-run (07-old, 1,4537). De wandklok overlapt wel. De mediaan van arm 2 (500,9 s) ligt binnen het bereik van arm 1 (397,6-521,9 s).

## Per run

| Run | Arm | Wand (s) | Kosten USD | Hoofdsessie USD | Aanroepen hoofdsessie | run-unit USD | Review d/h/q, fix | Fixrondes | Boom, blinde score |
|---|---|---|---|---|---|---|---|---|---|
| 01-old | 1 | 521,9 | 1,4670 | 0,7785 | 35 | 0 | 1/2/0, fix=2 | 1 | D, 24 |
| 02-new | 2 | 401,1 | 1,2010 | 0,4598 | 21 | 0,1590 | 1/0/0, fix=0 | 0 | E, 24 |
| 03-old | 3 | 360,7 | 1,1434 | 0,5748 | 34 | 0 | 1/0/0, fix=0 | 0 | I, 21 |
| 04-old | 1 | 446,8 | 1,5048 | 0,8146 | 35 | 0 | 1/1/1, fix=2 | 1 | A, 24 |
| 05-new | 2 | 550,9 | 1,3399 | 0,5145 | 23 | 0,1661 | 1/1/1, fix=2 | 1 | G, 23 |
| 06-old | 3 | 417,5 | 1,1580 | 0,4749 | 34 | 0 | 1/1/0, fix=1 | 1 | H, 23 |
| 07-old | 1 | 397,6 | 1,4537 | 0,8109 | 36 | 0 | 1/1/0, fix=1 | 1 | F, 22 |
| 08-new | 2 | 500,9 | 1,3093 | 0,4985 | 22 | 0,1686 | 1/1/0, fix=1 | 1 | C, 22 |
| 09-old | 3 | 402,4 | 1,2386 | 0,5393 | 37 | 0 | 1/1/1, fix=2 | 1 | B, 21 |

Bronnen: meta.json `wallMs`, stdout.json `total_cost_usd`, ANALYSIS.md "Per run" voor de hoofdsessie en run-unit, metrics.json `quality.reviewerReturn` en `quality.fixRounds`, en judgement.md met blind-key.txt voor boom en score. Alle negen runs eindigden met exitcode 0, zonder timeout, met stdout.json `subtype: success` en `is_error: false` (RUNNER.md, "Runs").

## Model per aanroep in de hoofdsessie

In arm 1 en arm 2 draaide elke aanroep van de hoofdsessie op `claude-opus-5-5`: 35, 35 en 36 aanroepen in arm 1, en 21, 23 en 22 in arm 2. In arm 3 draaide elke aanroep op `claude-sonnet-5-5`: 34, 34 en 37. Bron: `message.model` van elke assistentregel in het hoofdtranscript, ontdubbeld op `message.id` (ANALYSIS.md, "Model per call, main session").

De subagents volgen hun eigen agentdefinitie, niet de sessie. `exo:build-task`, `exo:fix-review` en `exo:run-unit` draaiden in alle armen op `claude-sonnet-5-5`, en `exo:review-branch-deep` in alle armen op `claude-opus-5-5` (ANALYSIS.md, "Subagent segments per run, by agentType"). In arm 3 kostte dat Opus-deel 0,2654-0,3068 USD per run (stdout.json `modelUsage.claude-opus-5-5.costUSD`).

## Route en dispatches

De hoofdtranscripten van arm 1 en arm 3 tonen alleen `Route: direct`, die van arm 2 alleen `Route: unit`. Bron: de regex `^Route:` over de tool-resultaten van `next-task.mjs` (ANALYSIS.md, "Route and dispatches").

In elke run gingen alle 5 taken precies één keer naar `exo:build-task`. In arm 1 en arm 3 dispatchte de hoofdsessie die vijf zelf. In arm 2 dispatchte de hoofdsessie één `exo:run-unit`, en die dispatchte de vijf build-tasks. Elke run had één `exo:review-branch-deep`, omdat taak 1 `Risk: public signature` draagt, en geen `exo:review-branch`. `exo:fix-review` liep één keer, behalve in 02-new en 03-old. Er was geen dispatch van `exo:solve-hard`, general-purpose of bug-fixer.

De besparing van arm 2 zit in de hoofdsessie. Die deed in de mediaan 22 aanroepen tegen 35, en las 633.516 tokens uit de cache tegen 1.274.405 (-50,3%, ANALYSIS.md "Main tokens cache read"). Daar staat run-unit tegenover, met 16 aanroepen op Sonnet en 0,1590-0,1686 USD per run. De build-tasks kostten in beide armen vrijwel hetzelfde: mediaan 0,3228 tegen 0,3243 USD (ANALYSIS.md "build-task cost").

## Kwaliteit

Eindcheck. In alle negen runs slaagden `npm test`, `npm run typecheck` en lint op de eindcommit, die gelijk was aan HEAD in een schone checkout (metrics.json `quality.recheck.results`, P/P/P in ANALYSIS.md "Quality").

Blinde score. Een beoordelaar kreeg de negen eindbomen als A tot en met I, zonder te weten welke run bij welke letter hoort, en gaf elk 0-5 punten op vijf punten: correctheid, de signatuurwijziging, testkwaliteit, helderheid en scope. Ontblind met blind-key.txt:

| Arm | Runs en bomen | Scores | Mediaan (min-max) | Gemiddelde |
|---|---|---|---|---|
| 1 | 01-old D, 04-old A, 07-old F | 24, 24, 22 | 24 (22-24) | 23,3 |
| 2 | 02-new E, 05-new G, 08-new C | 24, 23, 22 | 23 (22-24) | 23,0 |
| 3 | 03-old I, 06-old H, 09-old B | 21, 23, 21 | 21 (21-23) | 21,7 |

De mediaan van arm 2 ligt één punt onder die van arm 1, met hetzelfde bereik. De beoordelaar noemt de verschillen tussen alle bomen klein. Ze zitten in randgevallen en in testdiepte: elke boom haalt typecheck, lint en zijn eigen tests, en de tests doden 15 tot 18 van 19 mutaties (judgement.md, "Ranking" en "Mutation check of test quality"). Twee bomen gooien een RangeError bij een order zonder regels, wat de startcode wel bouwde: E (02-new, arm 2) en I (03-old, arm 3) (judgement.md, "Probe findings").

Reviewbevindingen. Elke review vond precies één defect, en in alle negen runs is het dezelfde procesregel: het implementatierapport `.exo/implementer-1.md` van taak 1 (`Risk: public signature`) citeert alleen de geslaagde run `npm test -- tests/tax.test.ts` (4 pass, 0 fail) en geen falende run ervoor (`repo/.exo/branch-review.md` van elke run). Dat is geen fout in de code. De reviewer gaf dit defect steeds de actie `report`, dus fix-review repareert het niet. Daarom hadden 02-new en 03-old, waar dit de enige bevinding was, `fix=0` en geen fixronde. De overige bevindingen zijn hazards en questions: mediaan 3 in arm 1 tegen 2 in arm 2 en arm 3 (metrics.json `quality.reviewerReturn`).

Fixrondes. Arm 1 had in elke run één fixronde, arm 2 en arm 3 elk in twee van de drie runs (metrics.json `quality.fixRounds`). Elke fixronde leverde één fixcommit en één regate op (`quality.fixCommits`, `phases.regate.runs`).

Vastgelopen taken. Geen enkele. Alle 5 taken landden in alle negen runs (`quality.landedTasks`, `allTasksLanded` true), elk subagent-transcript eindigt met een eindrapport, en geen transcript bevat een `PLAN DRIFT: Task`-weigering van land-task (ANALYSIS.md, "Quality" en afwijking 7).

## Slaapcheck

De Mac sliep niet tijdens de serie. `pmset -g log` toont in het venster van de eerste start tot het laatste einde, 11:41:35 tot 12:48:20 lokale tijd (+0200), geen enkele `Sleep`-, `Wake`- of `DarkWake`-gebeurtenis. Er staan alleen twee regels `Display is turned off`, om 11:47:33 en 11:53:27, en het scherm ging om 11:48:26 en 11:55:07 weer aan. `caffeinate -i` hield het systeem wakker. Bronnen: `/Users/thomash/bench-runs/unit-route/pmset-window.txt` en RUNNER.md, "Sleep check". Een ruimere tekstzoektocht vond 59 regels meer, allemaal `Assertions` met "Sleep" in de naam van de assertion en geen echte slaap (`pmset-window-loose.txt`).

## Wat de vergelijking oneerlijk kan maken

- n=3 per arm. Het verschil in blinde score van één punt in de mediaan valt binnen de spreiding van beide armen, en de wandklok van arm 1 en arm 2 overlapt. Alleen de kosten scheiden de armen zonder overlap.
- Eén plan van 5 taken op één fixture. Een plan met meer of zwaardere taken is niet gemeten. Op main gaat een plan van meer dan 8 taken (`BLOCK_TASK_LIMIT`) al naar run-unit, dus de branch verandert alleen de route voor plannen van 8 of minder taken (`git diff e274f33f 69f33f10 -- skills/build/scripts/next-task.mjs`).
- Arm 3 draait niet volledig op Sonnet. Alleen de hoofdsessie wisselt, en `exo:review-branch-deep` blijft op Opus via zijn agentdefinitie. De armen verschillen dus alleen in het model van de hoofdsessie en de route.
- In arm 2 sluiten de transcripten niet helemaal op de rekening aan. In 02-new telt stdout.json `modelUsage.claude-opus-5-5` 26.701 tokens en 0,0117 USD meer dan de transcripten, in 05-new 119 Sonnet-tokens en 0,0012 USD (ANALYSIS.md, afwijking 1). De verdeling over hoofdsessie, run-unit en overige subagents kan daar dus tot dat bedrag te laag zijn. Het totaal komt uit `total_cost_usd`, en de gaten zijn kleiner dan de afstand tussen de duurste arm-2-run en de goedkoopste arm-1-run.
- metrics.json `quality.findings` leest de `Count:`-regel van het rapport, en die noemt in 01-old, 04-old, 05-new en 09-old alleen `defect=1`. Dit rapport telt daarom de bevindingen uit de antwoordregel van de reviewer (`quality.reviewerReturn`, ANALYSIS.md afwijking 2).
- De volgorde was vast (1-2-3, drie keer), niet willekeurig. Elke arm stond in elke ronde op dezelfde plek.
- De blinde scores komen van één beoordelaar in één ronde.

## Reproduceren

De bench-worktrees:

```
git worktree add --detach .worktrees/bench-old e274f33f
git worktree add --detach .worktrees/bench-new 69f33f10
```

De serie, vanuit `/Users/thomash/bench-runs/unit-route`:

```
caffeinate -i bash /Users/thomash/bench-runs/unit-route/series.sh > series.out 2>&1
```

`series.sh` draait vanuit de hoofdcheckout van exo negen keer, één run tegelijk, in de volgorde arm 1, 2, 3, 1, 2, 3, 1, 2, 3. Een run van arm 2 is bijvoorbeeld:

```
node benchmarks/lean-gates.mjs --version new --model opus --plan new --timeout-min 30 --run 2 --out /Users/thomash/bench-runs/unit-route/arm2-opus-unit
```

Arm 1 gebruikt `--version old --model opus`, arm 3 `--version old --model sonnet`. Effort `medium` en budget 30 USD per run zijn de standaard (meta.json `effort`, `budget`). Claude Code 2.1.288 (meta.json `claudeVersion`), met `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` en `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.

De metrics per arm, die `metrics.json` in de arm-map schrijven:

```
node benchmarks/lean-gates-metrics.mjs /Users/thomash/bench-runs/unit-route/<arm-map>
```

De analyse, die `analysis.json` en `ANALYSIS.md` schrijft:

```
node /Users/thomash/bench-runs/unit-route/scripts/analyze.mjs
node /Users/thomash/bench-runs/unit-route/scripts/render.mjs
```

De blinde set, die `/tmp/ur-blind` en `blind-key.txt` schrijft:

```
node /Users/thomash/bench-runs/unit-route/scripts/blind-prep.mjs
```

Slaapstand: `pmset -g log`, venster 11:41:35-12:48:20 lokale tijd (+0200).
