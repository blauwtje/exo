
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir, run } from './harness.mjs';
import { GH_ERROR_EXIT } from '../skills/ship/scripts/gh-run.mjs';

const SHIP_GATE = fileURLToPath(new URL('../skills/ship/scripts/ship-gate.mjs', import.meta.url));

const passed = (name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS' });
const concluded = (name, conclusion) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion });
const clean = (checks) => ({ number: 12, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '', statusCheckRollup: checks });

const STAND_IN = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "fs.appendFileSync(process.env.STAND_IN_LOG, process.argv.slice(2).join(' ') + '\\n');",
  "if (process.env.STAND_IN_MODE === 'auth-error') { console.error('gh: To use GitHub CLI in a workflow, set the GH_TOKEN environment variable.'); process.exit(4); }",
  'const pullRequests = JSON.parse(process.env.STAND_IN_PULLS);',
  'console.log(JSON.stringify(pullRequests[process.argv[4]]));',
  ''
].join('\n');

const statusContext = (state) => ({ __typename: 'StatusContext', context: 'ci/legacy', state });
const withMerge = (fields) => ({ ...clean([passed('test')]), ...fields });

const VERDICTS = [
  ['checks passed, skipped or neutral', clean([passed('test'), concluded('deploy', 'SKIPPED'), concluded('lint', 'NEUTRAL')]), 'MERGE'],
  ['a successful status context', clean([statusContext('SUCCESS')]), 'MERGE'],
  ['no checks', clean([]), 'MERGE'],
  ['a cancelled check', clean([passed('test'), concluded('build', 'CANCELLED')]), 'STOP conclusion=CANCELLED build'],
  ['a failed check', clean([concluded('test', 'FAILURE')]), 'STOP conclusion=FAILURE test'],
  ['a pending check', clean([{ __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS', conclusion: '' }]), 'STOP status=IN_PROGRESS test'],
  ['a pending status context', clean([statusContext('PENDING')]), 'STOP state=PENDING ci/legacy'],
  ['a BEHIND branch', withMerge({ mergeStateStatus: 'BEHIND' }), 'BEHIND'],
  ['a DIRTY conflicting branch', withMerge({ mergeStateStatus: 'DIRTY', mergeable: 'CONFLICTING' }), 'DIRTY'],
  ['a BLOCKED branch', withMerge({ mergeStateStatus: 'BLOCKED' }), 'STOP mergeStateStatus=BLOCKED'],
  ['an UNKNOWN merge state', withMerge({ mergeStateStatus: 'UNKNOWN' }), 'STOP mergeStateStatus=UNKNOWN'],
  ['requested changes', withMerge({ reviewDecision: 'CHANGES_REQUESTED' }), 'STOP reviewDecision=CHANGES_REQUESTED'],
  ['a merged pull request', withMerge({ state: 'MERGED' }), 'STOP state=MERGED']
];

async function shipGate(args, pullRequests, mode = 'ok') {
  const directory = await tempDir('ui-design-test-');
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'gh'), STAND_IN, { mode: 0o755 });
  const log = path.join(directory, 'calls.log');
  const outcome = await run(SHIP_GATE, args, {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: log, STAND_IN_MODE: mode, STAND_IN_PULLS: JSON.stringify(pullRequests) }
  });
  const logged = await fs.readFile(log, 'utf8').catch(() => '');
  return { ...outcome, calls: logged.split('\n').filter((line) => line !== '') };
}

test('--pr reads the named pull request and prints one verdict line', async () => {
  const outcome = await shipGate(['--pr', '12'], { 12: clean([concluded('deploy', 'SKIPPED')]) });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'MERGE\n');
  assert.deepEqual(outcome.calls, ['pr view 12 --json number,state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup']);
});

for (const [name, pullRequest, verdict] of VERDICTS) {
  test(`--pr prints ${verdict} for ${name}`, async () => {
    const outcome = await shipGate(['--pr', '12'], { 12: pullRequest });
    assert.equal(outcome.stdout, `${verdict}\n`, outcome.stderr);
    assert.equal(outcome.code, verdict === 'MERGE' ? 0 : 1, outcome.stderr);
  });
}

test('--pr exits 1 on any verdict but MERGE', async () => {
  const outcome = await shipGate(['--pr', '12'], { 12: clean([concluded('build', 'CANCELLED')]) });
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, 'STOP conclusion=CANCELLED build\n');
});

test('--order prints stacked pull requests bases first, unrelated ones in the given order', async () => {
  const pullRequests = {
    14: { number: 14, baseRefName: 'feat/b', headRefName: 'feat/c' },
    20: { number: 20, baseRefName: 'main', headRefName: 'fix/x' },
    13: { number: 13, baseRefName: 'feat/a', headRefName: 'feat/b' },
    12: { number: 12, baseRefName: 'main', headRefName: 'feat/a' }
  };
  const outcome = await shipGate(['--order', '14', '20', '13', '12'], pullRequests);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, '12 13 14 20\n');
});

test('--order prints a loop of base and head branches as a cycle and exits 1', async () => {
  const pullRequests = {
    12: { number: 12, baseRefName: 'feat/b', headRefName: 'feat/a' },
    13: { number: 13, baseRefName: 'feat/a', headRefName: 'feat/b' }
  };
  const outcome = await shipGate(['--order', '12', '13'], pullRequests);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, 'CYCLE 12 13\n');
});

test('a gh failure stops with its first error line and exit 3', async () => {
  const outcome = await shipGate(['--pr', '12'], {}, 'auth-error');
  assert.equal(outcome.code, GH_ERROR_EXIT, outcome.stderr);
  assert.equal(outcome.stdout, 'STOP gh=gh pr view 12 --json number,state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup: gh: To use GitHub CLI in a workflow, set the GH_TOKEN environment variable.\n');
});

test('a missing or malformed argument is a usage error that runs no gh', async () => {
  for (const args of [[], ['--pr', 'abc'], ['--order'], ['--order', '12', 'x'], ['--pr', '12', '--order', '13']]) {
    const outcome = await shipGate(args, {});
    assert.equal(outcome.code, 2, args.join(' '));
    assert.deepEqual(outcome.calls, [], args.join(' '));
  }
});
