// The merge gate `shipping` runs right before a merge: a skipped or neutral
// check passes, a cancelled or pending one stops, BEHIND and DIRTY get their
// own verdicts, and stacked pull requests come out bases first.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';
import { GH_ERROR_EXIT, gateVerdict, stackOrder } from '../skills/shipping/scripts/ship-gate.mjs';

const SHIP_GATE = fileURLToPath(new URL('../skills/shipping/scripts/ship-gate.mjs', import.meta.url));

const passed = (name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS' });
const concluded = (name, conclusion) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion });
const clean = (checks) => ({ number: 12, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '', statusCheckRollup: checks });

test('a clean pull request whose checks passed, were skipped or were neutral merges', () => {
  assert.equal(gateVerdict(clean([passed('test'), concluded('deploy', 'SKIPPED'), concluded('lint', 'NEUTRAL')])), 'MERGE');
  assert.equal(gateVerdict(clean([{ __typename: 'StatusContext', context: 'ci/legacy', state: 'SUCCESS' }])), 'MERGE');
  assert.equal(gateVerdict(clean([])), 'MERGE');
});

test('a cancelled, failed or pending check stops and names the check', () => {
  assert.equal(gateVerdict(clean([passed('test'), concluded('build', 'CANCELLED')])), 'STOP conclusion=CANCELLED build');
  assert.equal(gateVerdict(clean([concluded('test', 'FAILURE')])), 'STOP conclusion=FAILURE test');
  assert.equal(gateVerdict(clean([{ __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS', conclusion: '' }])), 'STOP status=IN_PROGRESS test');
  assert.equal(gateVerdict(clean([{ __typename: 'StatusContext', context: 'ci/legacy', state: 'PENDING' }])), 'STOP state=PENDING ci/legacy');
});

test('BEHIND and DIRTY get their own verdicts; any other state than CLEAN stops', () => {
  assert.equal(gateVerdict({ ...clean([passed('test')]), mergeStateStatus: 'BEHIND' }), 'BEHIND');
  assert.equal(gateVerdict({ ...clean([passed('test')]), mergeStateStatus: 'DIRTY', mergeable: 'CONFLICTING' }), 'DIRTY');
  assert.equal(gateVerdict({ ...clean([passed('test')]), mergeStateStatus: 'BLOCKED' }), 'STOP mergeStateStatus=BLOCKED');
  assert.equal(gateVerdict({ ...clean([passed('test')]), mergeStateStatus: 'UNKNOWN' }), 'STOP mergeStateStatus=UNKNOWN');
  assert.equal(gateVerdict({ ...clean([passed('test')]), reviewDecision: 'CHANGES_REQUESTED' }), 'STOP reviewDecision=CHANGES_REQUESTED');
  assert.equal(gateVerdict({ ...clean([passed('test')]), state: 'MERGED' }), 'STOP state=MERGED');
});

test('stacked pull requests come out bases first, unrelated ones in the given order', () => {
  const pullRequests = [
    { number: 14, baseRefName: 'feat/b', headRefName: 'feat/c' },
    { number: 20, baseRefName: 'main', headRefName: 'fix/x' },
    { number: 13, baseRefName: 'feat/a', headRefName: 'feat/b' },
    { number: 12, baseRefName: 'main', headRefName: 'feat/a' }
  ];
  assert.deepEqual(stackOrder(pullRequests), { order: [12, 13, 14, 20] });
});

test('a loop of base and head branches is a cycle, not an order', () => {
  const pullRequests = [
    { number: 12, baseRefName: 'feat/b', headRefName: 'feat/a' },
    { number: 13, baseRefName: 'feat/a', headRefName: 'feat/b' }
  ];
  assert.deepEqual(stackOrder(pullRequests), { cycle: [12, 13] });
});

// Stands in for gh: logs its arguments and prints the JSON stored for the
// pull request it is asked about, or fails like an unauthenticated gh.
const STAND_IN = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "fs.appendFileSync(process.env.STAND_IN_LOG, process.argv.slice(2).join(' ') + '\\n');",
  "if (process.env.STAND_IN_MODE === 'auth-error') { console.error('gh: To use GitHub CLI in a workflow, set the GH_TOKEN environment variable.'); process.exit(4); }",
  'const pullRequests = JSON.parse(process.env.STAND_IN_PULLS);',
  'console.log(JSON.stringify(pullRequests[process.argv[4]]));',
  ''
].join('\n');

async function shipGate(args, pullRequests, mode = 'ok') {
  const directory = await fixture();
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

test('--pr exits 1 on any verdict but MERGE', async () => {
  const outcome = await shipGate(['--pr', '12'], { 12: clean([concluded('build', 'CANCELLED')]) });
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, 'STOP conclusion=CANCELLED build\n');
});

test('--order prints bases first on one line and exits 1 on a cycle', async () => {
  const stacked = {
    13: { number: 13, baseRefName: 'feat/a', headRefName: 'feat/b' },
    12: { number: 12, baseRefName: 'main', headRefName: 'feat/a' }
  };
  const ordered = await shipGate(['--order', '13', '12'], stacked);
  assert.equal(ordered.code, 0, ordered.stderr);
  assert.equal(ordered.stdout, '12 13\n');
  const looped = await shipGate(['--order', '13', '12'], { ...stacked, 12: { number: 12, baseRefName: 'feat/b', headRefName: 'feat/a' } });
  assert.equal(looped.code, 1, looped.stderr);
  assert.equal(looped.stdout, 'CYCLE 13 12\n');
});

test('a gh failure stops with its first error line and exit 3', async () => {
  const outcome = await shipGate(['--pr', '12'], {}, 'auth-error');
  assert.equal(outcome.code, GH_ERROR_EXIT, outcome.stderr);
  assert.equal(outcome.stdout, 'STOP gh=gh: To use GitHub CLI in a workflow, set the GH_TOKEN environment variable.\n');
});

test('a missing or malformed argument is a usage error that runs no gh', async () => {
  for (const args of [[], ['--pr', 'abc'], ['--order'], ['--order', '12', 'x'], ['--pr', '12', '--order', '13']]) {
    const outcome = await shipGate(args, {});
    assert.equal(outcome.code, 2, args.join(' '));
    assert.deepEqual(outcome.calls, [], args.join(' '));
  }
});
