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

async function runWithStandIn(suite) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'claude'), STAND_IN, { mode: 0o755 });
  const results = path.join(directory, 'results');
  await fs.mkdir(results);
  await fs.writeFile(path.join(results, 'aggregate-result.json'), JSON.stringify(aggregateWith(suite)));
  const log = path.join(directory, 'models.log');
  const outcome = await run(SCRIPT, [results], {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: log }
  });
  return { outcome, results, log };
}

test('stores a reason and a vote beside each failed llm grader vote only', async () => {
  const { outcome, results } = await runWithStandIn({ judgeModel: 'sonnet' });
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
  const { outcome } = await runWithStandIn({ judgeModel: 'sonnet' });
  assert.match(outcome.stdout, /\twithout\tnames-the-mechanisms\t0% \(0\/2\)\t2\t1\t1$/m);
  assert.match(outcome.stdout, /\twith\tnames-the-mechanisms\t100% \(1\/1\)\t0\t0\t0$/m);
});

test('judges with the run judge model, and with haiku when the run named none', async () => {
  const named = await runWithStandIn({ judgeModel: 'sonnet' });
  assert.deepEqual((await fs.readFile(named.log, 'utf8')).trim().split('\n'), ['sonnet', 'sonnet']);
  const unnamed = await runWithStandIn({});
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
