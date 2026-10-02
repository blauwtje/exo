Is nieuw sneller én goedkoper zonder kwaliteitsverlies? Nee: nieuw is sneller (mediane wandkloktijd -32,1%), maar niet goedkoper (mediane total_cost_usd -0,7%, gemiddelde +4,2%; mediane tokens +3,6%), en de kwaliteit is gelijk (alle eindchecks slagen op HEAD, mediane blinde score 22 nieuw tegen 20 oud, +10,0%).

# Benchmark lean-gates: exo oud (d33adf37) tegen nieuw (a8b27a45), 2026-10-02

Dit rapport vergelijkt twee versies van exo op dezelfde taak: `/exo:build` gevolgd door `exo:verify` op een TypeScript-fixture met vijf plantaken. Elke versie draaide drie keer. Elk getal hieronder noemt zijn bron. Alle bronbestanden staan in `.git/exo/bench-lean-gates/` van de hoofdcheckout, tenzij er een absoluut pad staat. De run-mappen staan in `/Users/thomash/bench-runs/lean-gates-2026-10-02/`.

Procentuele verschillen zijn steeds berekend uit de medianen (of, waar vermeld, de gemiddelden) als `(nieuw - oud) / oud x 100`. Voorbeeld voor de wandkloktijd: `(434040 - 639223) / 639223 x 100 = -32,1%`.

## Hoofdtabel per versie

Mediaan met spreiding (min-max) over n=3 runs per versie. Tijden in seconden, afgeleid van de milliseconden in de bron.

| Meting | Oud: mediaan (min-max) | Nieuw: mediaan (min-max) | Verschil mediaan | Bron |
|---|---|---|---|---|
| Wandklok totaal | 639,2 (561,9-723,3) | 434,0 (401,8-603,6) | -32,1% | meta.json `wallMs` |
| Buildfase | 355,2 (294,3-437,9) | 195,7 (163,3-259,3) | -44,9% | metrics.json `phases.build` (transcript-ts) |
| Verify-gate | 48,0 (47,1-53,0) | 44,7 (44,1-45,3) | -6,8% | metrics.json `phases.gate` (transcript-ts) |
| Review | 90,4 (63,5-118,3) | 92,5 (54,6-94,3) | +2,3% | metrics.json `phases.review` (transcript-ts) |
| Fixronde | 94,0 (70,3-142,8) | 66,0 (61,5-173,6) | -29,8% | metrics.json `phases.fixRound` (commit-ts) |
| Volledige suite-runs (log) | 11 (9-12) | 5 (4-8) | -54,5% | metrics.json `fullSuite.log.full` (suite-runs.jsonl) |
| Volledige suite-runs (Bash van agents) | 6 (4-6) | 3 (2-5) | -50,0% | metrics.json `fullSuite.bash.full` |
| Tokens totaal | 1.824.427 (1.822.093-2.001.059) | 1.889.241 (1.843.971-2.575.166) | +3,6% | metrics.json `tokens.total.totalTokens` |
| Tokens hoofdsessie | 1.261.252 (1.130.537-1.383.657) | 1.399.003 (1.240.763-1.980.774) | +10,9% | metrics.json `tokens.main.totalTokens` |
| Tokens subagents | 617.402 (563.175-691.556) | 594.392 (490.238-603.208) | -3,7% | totaal min hoofdsessie |
| Kosten totaal (USD) | 1,4135 (1,4089-1,5042) | 1,4033 (1,3840-1,7204) | -0,7% (gemiddelde +4,2%) | stdout.json `total_cost_usd` |
| Kosten hoofdsessie (USD) | 0,7719 (0,7067-0,8065) | 0,8460 (0,7532-1,0701) | +9,6% | cost-recon.md, gecorrigeerde tarieven |
| Kosten subagents (USD) | 0,6960 (0,6358-0,7068) | 0,6308 (0,5562-0,6503) | -9,4% | cost-recon.md, gecorrigeerde tarieven |
| Reviewbevindingen | 1 (1-2) | 2 (2-4) | +100% | metrics.json `quality.review` (branch-review.md) |
| Waarvan defects | 0 (0-0) | 1 (1-1) | n.v.t. | idem, `Count:`-regel |
| Blinde score (max 25) | 20 (20-24) | 22 (20-23) | +10,0% | /tmp/lg-blind/judgement.md + blind-key.txt |
| Eindcheck geslaagd (test/typecheck/lint) | 3 van 3 | 2 van 3 bij de recheck, 3 van 3 op HEAD | n.v.t. | metrics.json `quality.recheck`, lint-04.md |

De gemiddelde kosten zijn $1,4422 oud tegen $1,5026 nieuw (metrics.json `aggregate.*.costHarnessUsd`). Het gemiddelde ligt bij nieuw hoger door 02-new ($1,7204), de run met de valse FAIL (zie onder). Het tokenverschil van +3,6% is berekend uit de exacte medianen; de afgeronde tabel in metrics-table.md (1,89 tegen 1,82 M) zou +3,8% suggereren.

Over de kostenbron: metrics-table.md toont ook een kolom "$ transcript" ($2,01 oud, $2,04 nieuw als mediaan). Die overschat de kosten, want `benchmarks/prices.mjs` heeft geen rij voor `claude-opus-5-5` en prijst het model daardoor als `claude-opus-5` ($5/$25 in plaats van $4/$20 per miljoen, cost-recon.md). Dit rapport gebruikt daarom `total_cost_usd` uit stdout.json, dat de subagents al bevat en tot op $0,002 overeenkomt met de transcripttokens tegen de juiste tarieven. De splitsing tussen hoofdsessie en subagents komt uit die gecorrigeerde transcriptprijzen (cost-recon.md).

## Per run

Bron per kolom als in de hoofdtabel. Reviewer: `REVIEWER:`-regel uit metrics.json `reviewer.line`, verwacht volgens de eigen regel van de versie uit `reviewer.expectedByOwnRule`.

| Run | Wand (s) | Build (s) | Gate (s) | Review (s) | Fixronde (s) | Suite log/Bash | Tokens (hoofd/sub) | Kosten USD (hoofd/sub) | Reviewer gekozen/verwacht | Bevindingen (defect/hazard) | Blind | Recheck t/tc/l |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01-old | 723,3 | 437,9 | 53,0 | 118,3 | 70,3 | 12/6 | 1.822.093 (1.130.537/691.556) | 1,4135 (0,7067/0,7068) | deep/deep | 1 (0/1) | F: 24 | P/P/P |
| 02-new | 603,6 | 259,3 | 44,7 | 94,3 | 173,6 | 8/5 | 2.575.166 (1.980.774/594.392) | 1,7204 (1,0701/0,6503) | deep/deep | 4 (1/3) | D: 20 | P/P/P |
| 03-old | 561,9 | 294,3 | 47,1 | 90,4 | 94,0 | 9/4 | 2.001.059 (1.383.657/617.402) | 1,5042 (0,8065/0,6960) | deep/deep | 2 (0/2) | E: 20 | P/P/P |
| 04-new | 434,0 | 195,7 | 44,1 | 92,5 | 61,5 | 5/3 | 1.843.971 (1.240.763/603.208) | 1,3840 (0,7532/0,6308) | deep/deep | 2 (1/1) | B: 23 | P/P/F |
| 05-old | 639,2 | 355,2 | 48,0 | 63,5 | 142,8 | 11/6 | 1.824.427 (1.261.252/563.175) | 1,4089 (0,7719/0,6358) | deep/deep | 1 (0/1) | C: 20 | P/P/P |
| 06-new | 401,8 | 163,3 | 45,3 | 54,6 | 66,0 | 4/2 | 1.889.241 (1.399.003/490.238) | 1,4033 (0,8460/0,5562) | deep/deep | 2 (1/1) | A: 22 | P/P/P |

"deep" staat voor `review-branch-deep`. Alle zes runs eindigden met exitcode 0, landden taken 1-5 en hadden precies één fixronde (meta.json, metrics.json `quality`).

## Buildtijd per taak

Seconden tussen opeenvolgende `Plan-task:`-commits; de eerste taak telt vanaf de start van de run (metrics.json `phases.buildPerTask`, bron commit-ts, resolutie 1 s). Taken 1-3 lopen parallel in een wave, dus deze delta's zijn landingsgaten en geen bouwtijd. De echte bouwtijd per subagent staat in metrics.json `phases.buildTaskAgents`.

| Run | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| 01-old | 192,2 | 33 | 33 | 78 | 99 |
| 03-old | 99,9 | 33 | 32 | 60 | 68 |
| 05-old | 159,6 | 0 | 0 | 93 | 100 |
| 02-new | 87,7 | 1 | 1 | 57 | 110 |
| 04-new | 60,5 | 1 | 1 | 28 | 103 |
| 06-new | 59,7 | 1 | 0 | 69 | 31 |

In 01-old en 03-old zitten tussen de landingen van T1, T2 en T3 gaten van 32-33 s. Dat is de duur van één volledige `npm test` (de suite duurt ongeveer 33 s, build.md), de oude land gate die per taak draait (suite-analysis.md). Bij nieuw landen die taken binnen 1 s na elkaar, omdat de land gate `npm run typecheck` is. 05-old toont geen gaten bij T2 en T3, en de sources verklaren niet waarom; metrics.json vermeldt voor die run wel 5 land-task-aanroepen.

## Reviewerkeuze

Elke run printte `REVIEWER: review-branch-deep` en dispatchte die ook (metrics.json `reviewer`). Beide versies kozen dus zes van zes keer de diepe review, en dat paste telkens bij hun eigen regel (`fitsRule: true`):

- Oud kiest deep bij meer dan 5 bestanden of meer dan 200 gewijzigde regels. De diffs telden 10 bestanden en 272-293 regels (metrics.json `reviewer.risk.files`, `changedLines`).
- Nieuw kiest deep omdat taak 1 `Risk: public signature` draagt (`riskTasks` in metrics.json, PLANS.md). De exportsignaturen van `taxRate` en `computeTax` veranderden ook, wat de regel los daarvan zou laten afgaan.

Op deze fixture leverde de risicogebaseerde keuze dus niets op: de oude diffregel kwam op hetzelfde uit. Een besparing in reviewtijd is hier niet te zien; de mediane review was bij nieuw zelfs 2,3% langer.

## Volledige suite-runs

suite-analysis.md kent elke volledige suite-run toe aan een oorzaak, maar alleen voor 01-old en 02-new. Voor de andere runs zijn alleen de aantallen bekend (metrics.json).

| Run | Volledig (log) | Vereist door de regels | Extra | Extra door wie |
|---|---|---|---|---|
| 01-old | 12 | 6 (5 land gates, 1 verify-gate) | 6 | build-task 4, hoofdsessie 1, reviewer 1 |
| 02-new | 8 | 3 (verify-gates) | 5 | build-task 3, reviewer 1, fix-review 1 |

- Oud vereist per run 5 land gates met `npm test` plus de verify-gate. Nieuw vereist alleen de verify-gate per verify-ronde, omdat de land gate `npm run typecheck` is.
- In 02-new was de derde verify-gate alleen nodig door een valse `FAIL Task 1` (zie Kwaliteit). Zonder die FAIL had 02-new 7 volledige runs gelogd, waarvan 2 vereist (fail-task1.md).
- In beide versies draaiden build-task-agents zelf `npm test`, tegen de regel in `agents/build-task.md:30` ("Run only the brief's `Proof:` or `Run:`, never the plan's `Land gate:`"). Ook de diepe reviewer draaide in beide versies de suite, en in nieuw ook de fixer, hoewel geen regel daarom vraagt.
- In 01-old draaide de hoofdsessie `npm test` met de hand direct nadat verify.mjs `SKIP success-criterion` meldde.
- Door agents gestarte runs: oud 6 van 12, nieuw 5 van 8. De winst zit dus in de gates, niet in het gedrag van de agents.

## Kwaliteit

**Eindcheck.** De recheck draait `npm test`, `npm run typecheck` en `npm run lint` op de eind-HEAD (metrics.json `quality.recheck`). Vijf runs slagen op alle drie. 04-new faalt op lint met één fout in `repo/.exo/probe.ts`, een ongetrackt kladbestand dat de hoofdsessie na verify en na de fixcommit schreef om de Stop-hook een productproof te geven (lint-04.md). Een kloon op HEAD 29a32f6 lint schoon, dus alle commits zijn lint-schoon en dit is geen regressie van de gates. Oud zou het ook gemist hebben: oud lint nergens. Wel blijkt dat nieuw de fix-review-commit nooit lint, omdat `land-task --fix` en verify allebei geen lint draaien. De blinde beoordelaar zag alle zes bomen slagen op typecheck, lint en test (judgement.md).

**Valse FAIL in 02-new.** De tweede verify-ronde meldde `FAIL Task 1`, terwijl de test nooit draaide: het proces stierf binnen ongeveer 0,1 s, voordat de testwrapper een logregel schreef. Dezelfde boom slaagde daarna met de hand, in de derde verify-ronde en in 8 reproductiepogingen (fail-task1.md). Dit kostte 77 s van de 603,6 s wandklok en ongeveer $0,3. De oorzaak ligt in code die oud en nieuw delen; verify.mjs gooit bij een proof-FAIL de uitvoer, exitcode en het signaal weg.

**Reviewbevindingen.** Uit `repo/.exo/branch-review.md` per run:

- Oud vond geen defects, alleen hazards: in 01-old dat `buildInvoice` nu gooit bij een order zonder regels; in 03-old dat verzendkosten bij een lege order stil verdwijnen en dat `renderInvoice` geen verzendregel toont; in 05-old alleen die ontbrekende verzendregel. Alle hazards werden gefixt.
- Nieuw vond in elke run precies één defect, en steeds hetzelfde: het implementatierapport van taak 1 toont alleen een geslaagde proofrun en geen falende run ervoor, wat de regel voor een `Risk:`-taak eist. Dat is een procesbevinding, geen codefout, en hij kan alleen bij nieuw ontstaan omdat alleen het nieuwe plan `Risk:` op taak 1 heeft. Hij werd steeds als "report" afgehandeld, niet gefixt.
- Daarnaast vond nieuw dezelfde soort hazards als oud: de gooiende lege order (04-new, 06-new), en in 02-new de verdwijnende verzendkosten, de ontbrekende verzendregel en een onverklaarde `as RatePeriod`-cast. Alle gefixt.

Het hogere aantal bevindingen bij nieuw (mediaan 2 tegen 1) komt dus vooral door die Risk-procesregel, niet door slechtere code.

**Blinde beoordeling.** De beoordelaar zag alleen diffs, bomen en de spec onder `/tmp/lg-blind`, zonder planheaders en exo-sporen, en scoorde vijf criteria van 1 tot 5 (judgement.md). Ontblind met blind-key.txt:

| Rang | Boom | Run | Score |
|---|---|---|---|
| 1 | F | 01-old | 24 |
| 2 | B | 04-new | 23 |
| 3 | A | 06-new | 22 |
| 4 (gedeeld) | C | 05-old | 20 |
| 4 (gedeeld) | E | 03-old | 20 |
| 6 | D | 02-new | 20 |

Mediaan nieuw 22, oud 20; gemiddeld 21,67 tegen 21,33 (+1,6%). De beste boom is een oude run. Volgens de beoordelaar zijn de verschillen klein en draaien ze om teststerkte, scopediscipline en randgevallen buiten de spec; alle zes voldoen aan elke acceptatie-eis.

## Opzet

- Versies: oud `d33adf3769ca18068557defb79b305fcf932eb27`, nieuw `a8b27a456cf4430109a10f7c7ff8bc3f38a8f29c`, beide als losse worktree zonder wijzigingen (`pluginDirty: false`, meta.json).
- Claude Code `2.1.287`, Node `v24.16.0` (meta.json).
- Hoofdsessie: model `claude-opus-5-5`, effort `medium` (meta.json). Subagents gebruiken het model uit hun frontmatter: `claude-sonnet-5-5` voor build-task en fix-review, `claude-opus-5-5` voor review-branch-deep, en in 03-old één general-purpose-agent op `claude-opus-5-5` (metrics.json `tokens.byAgentType`, cost-recon.md).
- Aanroep: `claude -p <prompt> --plugin-dir <worktree> --model --effort --permission-mode bypassPermissions --output-format json --setting-sources project,local --strict-mcp-config --max-budget-usd <b> --session-id <uuid>` (build.md). De prompt is voor beide versies gelijk.
- Isolatie: de harness verwijdert `CLAUDECODE`, `CLAUDE_EFFORT` en alle `CLAUDE_CODE_*` uit de omgeving en zet `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` en `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` (meta.json `env`). Uitvoermappen staan buiten elke repo en elke map met CLAUDE.md. Een probe met haiku per versie vond 0 geladen CLAUDE.md-instructies en wel een geladen exo (build.md).
- Projectinstellingen in de fixture: specs docs, replies tight, budget medium, ship local, workspace branch, guards on (exo-settings.txt).
- Fixture: TypeScript-pakket `invoice-calc` met scripts `test`, `typecheck` en `lint`. De tests gebruiken een gesimuleerde ledger met 40 ms per round trip en 130 gevallen per bestand, waardoor de volle suite ongeveer 33 s duurt en één testbestand ongeveer 6 s (build.md).
- Plannen: hetzelfde doel, dezelfde vijf taken en hetzelfde succescriterium (`npm test` passes). Er verschillen alleen drie regels, elk de standaard die de eigen spec-skill schrijft (PLANS.md): `Land gate: npm test` (oud) tegen `Land gate: npm run typecheck` (nieuw), `Lint: npx eslint` (alleen nieuw), en `Risk: public signature` op taak 1 (alleen nieuw).
- Volgorde afwisselend: 01-old, 02-new, 03-old, 04-new, 05-old, 06-new, achter elkaar op 2026-10-02 van 12:19:39Z tot 13:16:17Z (meta.json `startedAt`/`endedAt`).

## Wat de vergelijking oneerlijk kan maken

- **n=3 per versie.** De spreiding is groot (wandklok nieuw 401,8-603,6 s), dus één afwijkende run verschuift een gemiddelde sterk.
- **Warme promptcache.** De runs liepen direct na elkaar. De hoofdsessie schrijft alleen 1-uurscache (cost-recon.md), dus latere runs kunnen van eerdere profiteren; 01-old startte koud. Elke versie heeft wel een vroege en een late run.
- **API-latentie en netwerk** variëren per moment en zijn niet gemeten.
- **Valse FAIL in 02-new** (77 s, ongeveer $0,3, een extra suite-run) treft alleen nieuw, terwijl de oorzaak in gedeelde code zit.
- **Kladbestand in 04-new** laat de recheck-lint falen zonder dat de code fout is.
- **De plannen verschillen bewust**, ook in `Risk:`. Daardoor meet de benchmark ook de Risk-regel, die bij nieuw elke run een procesdefect opleverde.
- **Kunstmatig trage tests.** De gesimuleerde ledger maakt elke volledige suite-run 33 s; dat vergroot de winst van minder suite-runs ten opzichte van een project met snelle tests.
- **Gemengde subagentmodellen** (sonnet voor bouwen en fixen, opus voor reviewen) zijn per versie gelijk, maar de verhouding verschilt per run.
- **Afgebroken eerste poging.** De eerste 01-old lekte `~/.claude/CLAUDE.md` en de exo-CLAUDE.md in de sessie en is gestopt en uitgesloten (progress.md, build.md). Bewaard in `/Users/thomash/bench-runs/aborted-01-old-claude-md-leak`.
- **Ontbrekende prijsrij** in `prices.mjs` voor `claude-opus-5-5`, waardoor de kolom "$ transcript" te hoog is; dit rapport gebruikt die kolom niet.
- **Eigenaardigheid van de testwrapper:** `node --test` met één ontbrekend bestand naast bestaande bestanden eindigt met 0, terwijl één los ontbrekend bestand met 1 eindigt (progress.md, build.md).
- **Eén machine, één dag.**

## Reproduceren

De harness, fixture, plannen en tests staan ongecommit in de worktree `.worktrees/bench-lean-gates` (`benchmarks/lean-gates.mjs`, `benchmarks/lean-gates-metrics.mjs`, `benchmarks/lean-gates/`, `tests/benchmark-lean-gates*.test.mjs`). De worktrees `.worktrees/bench-old` en `.worktrees/bench-new` moeten op d33adf37 en a8b27a45 staan. Vanuit de bench-lean-gates-worktree, één run per regel, in deze volgorde:

```sh
OUT=/Users/thomash/bench-runs/lean-gates-2026-10-02
node benchmarks/lean-gates.mjs --version old --run 1 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version new --run 2 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version old --run 3 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version new --run 4 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version old --run 5 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version new --run 6 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates-metrics.mjs $OUT
```

De harness weigert een bestaande run-map, dus kies voor een nieuwe meting een lege `--out` buiten elke repo. De metrics-stap schrijft `$OUT/metrics.json` en print de tabel uit metrics-table.md; `--no-recheck` slaat de eindcheck over.
