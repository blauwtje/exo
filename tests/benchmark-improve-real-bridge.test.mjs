import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPLITS } from '../benchmarks/improve-real-copy.mjs';
import { scoreTarget, startScoreBridge, writeScoreClient } from '../benchmarks/improve-real-bridge.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAST = { ...process.env, EXO_SCORE_POLL_MS: '20', EXO_SCORE_WAIT_MS: '10000' };

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'improve-real-bridge-test-'));
}

function armCopy(target, text) {
  const dir = temp();
  const stateDir = path.join(temp(), 'state');
  fs.mkdirSync(path.join(dir, path.dirname(SPLITS[target].file)), { recursive: true });
  fs.writeFileSync(path.join(dir, SPLITS[target].file), text);
  writeScoreClient({ dir, stateDir, target });
  return { dir, stateDir };
}

function runClient(dir) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(dir, 'score.mjs')], { env: FAST }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

function fakeBridge(stateDir, calls, seen = []) {
  const score = async ({ targetText, split }) => {
    seen.push({ targetText, split });
    return { scores: [0.5], mean: 0.5, spend: 0.25, outs: [] };
  };
  process.env.EXO_SCORE_BRIDGE_POLL_MS = '20';
  return startScoreBridge({ stateDir, repo: REPO, target: 'routing', calls, score });
}

test('the client writes a read-only file', () => {
  const { dir } = armCopy('routing', 'x');
  assert.equal(fs.statSync(path.join(dir, 'score.mjs')).mode & 0o222, 0);
});

test('a client request returns the number the bridge scored from the arm copy text', async () => {
  const { dir, stateDir } = armCopy('routing', 'edited skill text');
  const seen = [];
  const bridge = await fakeBridge(stateDir, 2, seen);
  const outcome = await runClient(dir);
  await bridge.stop();
  assert.equal(outcome.code, 0);
  assert.equal(outcome.stdout.trim(), '0.5');
  assert.deepEqual(seen, [{ targetText: 'edited skill text', split: 'train' }]);
});

test('the call after K refuses with exit 1 and the count on stderr', async () => {
  const { dir, stateDir } = armCopy('routing', 'x');
  const bridge = await fakeBridge(stateDir, 2);
  const outcomes = [];
  for (let call = 0; call < 3; call += 1) outcomes.push(await runClient(dir));
  const summary = await bridge.stop();
  assert.deepEqual(outcomes.map((outcome) => outcome.code), [0, 0, 1]);
  assert.equal(outcomes[2].stderr.trim(), 'score.mjs refuses: 2 calls used');
  assert.equal(outcomes[2].stdout, '');
  assert.equal(summary.calls, 2);
});

test('the bridge sums spend and keeps a history entry per scored call', async () => {
  const { dir, stateDir } = armCopy('routing', 'x');
  const bridge = await fakeBridge(stateDir, 3);
  await runClient(dir);
  await runClient(dir);
  const summary = await bridge.stop();
  assert.equal(summary.spend, 0.5);
  assert.deepEqual(summary.history.map((entry) => entry.score), [0.5, 0.5]);
});

test('a failing scorer gives the client exit 1 and counts the call', async () => {
  const { dir, stateDir } = armCopy('routing', 'x');
  process.env.EXO_SCORE_BRIDGE_POLL_MS = '20';
  const score = async () => {
    throw new Error('scorer broke');
  };
  const bridge = startScoreBridge({ stateDir, repo: REPO, target: 'routing', calls: 1, score });
  const outcome = await runClient(dir);
  const summary = await bridge.stop();
  assert.equal(outcome.code, 1);
  assert.match(outcome.stderr, /scorer broke/);
  assert.equal(summary.calls, 1);
});

function routingOut(recall, cost) {
  return { results: { 'sonnet:low': { hook: { train: { 'find-cause': { recall } } } } }, sessions: [{ cost_usd: cost }, { cost_usd: cost }] };
}

test('scoreTarget averages runs, sums spend and scores the pristine view with the given text', async () => {
  const recalls = [0.5, 1];
  const seenViews = [];
  const scorer = async ({ view, outFile, target }) => {
    seenViews.push({ target, text: fs.readFileSync(path.join(view, SPLITS.routing.file), 'utf8'), root: fs.existsSync(path.join(view, 'benchmarks', 'routing.mjs')) });
    fs.writeFileSync(outFile, JSON.stringify(routingOut(recalls.shift(), 0.1)));
  };
  const result = await scoreTarget({ repo: REPO, target: 'routing', split: 'train', targetText: 'my text', runs: 2, scorer });
  assert.deepEqual(result.scores, [0.5, 1]);
  assert.equal(result.mean, 0.75);
  assert.ok(Math.abs(result.spend - 0.4) < 1e-9);
  assert.equal(result.outs.length, 2);
  assert.deepEqual(seenViews, [
    { target: 'routing', text: 'my text', root: true },
    { target: 'routing', text: 'my text', root: true }
  ]);
});

test('scoreTarget removes its temporary view after each run', async () => {
  const views = [];
  const scorer = async ({ view, outFile }) => {
    views.push(view);
    fs.writeFileSync(outFile, JSON.stringify(routingOut(1, 0)));
  };
  await scoreTarget({ repo: REPO, target: 'routing', split: 'held-out', targetText: 'a', runs: 1, scorer });
  assert.equal(fs.existsSync(views[0]), false);
});
