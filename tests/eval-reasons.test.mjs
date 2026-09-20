// eval-reasons.mjs asks one reasoning judge per failed llm grader vote of an
// eval run and stores its reason beside the runner's one-word votes. A stand-in `claude`
// on PATH answers, so no model is called.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../eval-reasons.mjs', import.meta.url));

// Passes an output that reports the refusals, fails any other, and records the model it was given.
const STAND_IN = `#!/usr/bin/env node
const fs = require('node:fs');
const prompt = fs.readFileSync(0, 'utf8');
const model = process.argv[process.argv.indexOf('--model') + 1];
fs.appendFileSync(process.env.STAND_IN_LOG, model + '\\n');
const verdict = prompt.includes('refused 70 reads') ? 'PASS' : 'FAIL';
const result = 'Quoted "VERDICT: PASS" from the criterion.\\nThe output decides it.\\nVERDICT: ' + verdict;
process.stdout.write(JSON.stringify({ result, total_cost_usd: 0.01, is_error: false }));
`;

function aggregateWith(suite) {
  const graders = [
    { name: 'names-the-mechanisms', type: 'llm', config: { criteria: 'PASS when it names the big-file guard.', focus: 'last_message' } },
    { name: 'mentions-exo', type: 'regex', config: { pattern: 'exo' } }
  ];
  const runGraders = (evidence, passed) => [
    { name: 'names-the-mechanisms', passed, judgeVotes: [passed, passed, passed], evidence },
    { name: 'mentions-exo', passed: true, evidence: 'exo' }
  ];
  return {
    suite,
    cases: [{
      name: 'savings-report-reads-cold',
      graders,
      arms: {
        with: [{ graders: runGraders('the big-file guard refused 70 reads', true) }],
        without: [
          { graders: runGraders('the big-file guard refused 70 reads', false) },
          { graders: runGraders('nothing about guards', false) },
          { error: 'rate limited', graders: [] }
        ]
      }
    }]
  };
}

// One arm of three runs graded by an llm and a regex grader. An llm verdict
// fails when its evidence is given; 'refused 70 reads' in it makes the stand-in reverse that verdict.
function gateAggregate(failedEvidence, regexPasses) {
  const graders = [
    { name: 'names-the-mechanisms', type: 'llm', config: { criteria: 'PASS when it names the big-file guard.', focus: 'last_message' } },
    { name: 'mentions-exo', type: 'regex', config: { pattern: 'exo' } }
  ];
  const runs = failedEvidence.map((evidence, index) => ({
    graders: [
      { name: 'names-the-mechanisms', passed: evidence === null, judgeVotes: Array(3).fill(evidence === null), evidence: evidence ?? 'passed' },
      { name: 'mentions-exo', passed: regexPasses[index], evidence: 'exo' }
    ]
  }));
  return { suite: { judgeModel: 'sonnet' }, cases: [{ name: 'using-exo-closing-line', graders, arms: { plugin: runs } }] };
}

async function runWithStandIn(aggregate) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'claude'), STAND_IN, { mode: 0o755 });
  const results = path.join(directory, 'results');
  await fs.mkdir(results);
  await fs.writeFile(path.join(results, 'aggregate-result.json'), JSON.stringify(aggregate));
  const log = path.join(directory, 'models.log');
  const outcome = await run(SCRIPT, [results], {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: log }
  });
  return { outcome, results, log };
}

test('stores a reason and a vote beside each failed llm grader vote only', async () => {
  const { outcome, results } = await runWithStandIn(aggregateWith({ judgeModel: 'sonnet' }));
  assert.equal(outcome.code, 0, outcome.stderr);
  const reasons = JSON.parse(await fs.readFile(path.join(results, 'judge-reasons.json'), 'utf8'));
  assert.equal(reasons.votes.length, 2);
  assert.ok(reasons.votes.every((vote) => vote.grader === 'names-the-mechanisms' && vote.runnerPassed === false));
  const [judgedPass, judgedFail] = reasons.votes;
  assert.deepEqual([judgedPass.arm, judgedPass.run, judgedPass.reasonedPassed], ['without', 0, true]);
  assert.deepEqual([judgedFail.arm, judgedFail.run, judgedFail.reasonedPassed], ['without', 1, false]);
  assert.equal(judgedPass.reasoning, 'Quoted "VERDICT: PASS" from the criterion.\nThe output decides it.');
  assert.deepEqual(judgedFail.runnerVotes, [false, false, false]);
  assert.deepEqual(reasons.errors.map((entry) => [entry.arm, entry.run, entry.error]), [['without', 2, 'rate limited']]);
});

test('prints each grader pass rate per arm over all runs, apart from errored runs', async () => {
  const { outcome } = await runWithStandIn(aggregateWith({ judgeModel: 'sonnet' }));
  assert.match(outcome.stdout, /\twithout\tnames-the-mechanisms\t0% \(0\/2\)\t2\t1\t1$/m);
  assert.match(outcome.stdout, /\twith\tnames-the-mechanisms\t100% \(1\/1\)\t0\t0\t0$/m);
});

test('the gate passes an arm where no grader failed more than one run', async () => {
  const { outcome } = await runWithStandIn(gateAggregate([null, 'nothing about guards', null], [true, true, false]));
  assert.match(outcome.stdout, /^GATE PASS\tusing-exo-closing-line\tplugin\tno grader failed more than 1 of 3 runs$/m);
});

test('the gate fails on two failed runs of a free grader, which no judge reverses', async () => {
  const { outcome } = await runWithStandIn(gateAggregate([null, null, null], [false, true, false]));
  assert.match(outcome.stdout, /^GATE FAIL\tusing-exo-closing-line\tplugin\tmentions-exo failed 2 of 3 runs, 0 reversed by the reasoning judge$/m);
});

test('the gate is disputed when the reasoning judge reversed the verdicts that broke it', async () => {
  const reversed = 'the big-file guard refused 70 reads';
  const { outcome } = await runWithStandIn(gateAggregate([reversed, reversed, null], [true, true, true]));
  assert.match(outcome.stdout, /^GATE DISPUTED\tusing-exo-closing-line\tplugin\tnames-the-mechanisms failed 2 of 3 runs, 2 reversed by the reasoning judge$/m);
});

test('the gate counts an errored run against every grader and skips an arm under three runs', async () => {
  const { outcome } = await runWithStandIn(aggregateWith({ judgeModel: 'sonnet' }));
  assert.match(outcome.stdout, /^GATE FAIL\tsavings-report-reads-cold\twithout\tnames-the-mechanisms failed 3 of 3 runs, 1 reversed by the reasoning judge$/m);
  assert.match(outcome.stdout, /^GATE NONE\tsavings-report-reads-cold\twith\t1 runs, a gate needs 3$/m);
});

test('a draft run gets no gate, because a draft is never a verdict', async () => {
  const aggregate = gateAggregate([null, null, null], [true, true, true]);
  aggregate.suite.authoritative = false;
  const { outcome } = await runWithStandIn(aggregate);
  assert.match(outcome.stdout, /^GATE NONE\tusing-exo-closing-line\tplugin\tdraft run, a gate needs the full run$/m);
  assert.doesNotMatch(outcome.stdout, /^GATE PASS/m);
});

test('the gate counts a grader without a verdict as a failed run', async () => {
  const { outcome } = await runWithStandIn(gateAggregate([null, null, null], [null, true, false]));
  assert.match(outcome.stdout, /^GATE FAIL\tusing-exo-closing-line\tplugin\tmentions-exo failed 2 of 3 runs, 0 reversed by the reasoning judge$/m);
});

test('a case graded by free graders alone still gets its gate', async () => {
  const aggregate = gateAggregate([null, null, null], [true, true, true]);
  const [evalCase] = aggregate.cases;
  evalCase.graders = evalCase.graders.filter((grader) => grader.type !== 'llm');
  for (const run of evalCase.arms.plugin) run.graders = run.graders.filter((grader) => grader.name === 'mentions-exo');
  const { outcome } = await runWithStandIn(aggregate);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.match(outcome.stdout, /^GATE PASS\tusing-exo-closing-line\tplugin\t/m);
});

test('a non-gating grader stays in the pass-rate table and out of the gate', async () => {
  const missed = 'nothing about guards';
  const aggregate = gateAggregate([missed, missed, missed], [true, true, true]);
  const [evalCase] = aggregate.cases;
  evalCase.name = 'planning-reads-the-repository-map';
  const downgraded = 'dispatches-for-what-the-map-leaves-open';
  const rename = (grader) => { if (grader.name === 'names-the-mechanisms') grader.name = downgraded; };
  evalCase.graders.forEach(rename);
  for (const run of evalCase.arms.plugin) run.graders.forEach(rename);
  const { outcome } = await runWithStandIn(aggregate);
  assert.match(outcome.stdout, /^GATE PASS\tplanning-reads-the-repository-map\tplugin\tno grader failed more than 1 of 3 runs; left out of the gate: dispatches-for-what-the-map-leaves-open$/m);
  assert.match(outcome.stdout, /\tplugin\tdispatches-for-what-the-map-leaves-open\t0% \(0\/3\)\t3\t0\t0$/m);
});

test('a stale non-gating name is reported and gates as usual', async () => {
  const missed = 'nothing about guards';
  const aggregate = gateAggregate([missed, missed, missed], [true, true, true]);
  const [evalCase] = aggregate.cases;
  evalCase.name = 'planning-reads-the-repository-map';
  const { outcome } = await runWithStandIn(aggregate);
  assert.match(outcome.stderr, /NON_GATING_GRADERS names dispatches-for-what-the-map-leaves-open for planning-reads-the-repository-map, which this run does not grade/);
  assert.match(outcome.stdout, /^GATE FAIL\tplanning-reads-the-repository-map\tplugin\tnames-the-mechanisms failed 3 of 3 runs, 0 reversed by the reasoning judge$/m);
});

test('judges with the run judge model, and with haiku when the run named none', async () => {
  const named = await runWithStandIn(aggregateWith({ judgeModel: 'sonnet' }));
  assert.deepEqual((await fs.readFile(named.log, 'utf8')).trim().split('\n'), ['sonnet', 'sonnet']);
  const unnamed = await runWithStandIn(aggregateWith({}));
  assert.deepEqual((await fs.readFile(unnamed.log, 'utf8')).trim().split('\n'), ['haiku', 'haiku']);
  const unnamedReasons = JSON.parse(await fs.readFile(path.join(unnamed.results, 'judge-reasons.json'), 'utf8'));
  assert.equal(unnamedReasons.judgeModelSource, 'runner default, not recorded by the run');
  assert.match(unnamed.outcome.stdout, /^judge model: haiku \(runner default, not recorded by the run\)$/m);
});

test('refuses a directory without aggregate-result.json', async () => {
  const directory = await fixture();
  const outcome = await run(SCRIPT, [directory], { cwd: directory });
  assert.equal(outcome.code, 1);
  assert.match(outcome.stderr, /aggregate-result\.json does not exist/);
});
