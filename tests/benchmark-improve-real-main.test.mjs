import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARMS,
  armConfig,
  armPrompt,
  armRecord,
  dryRunLines,
  dryRunPlan,
  goalText,
  parseOptions,
  projectedSpend,
  recordedKeys,
  runKey,
  scorerSessions,
  sessionUsd,
  spentSoFar,
  withImproveRoundTier
} from '../benchmarks/improve-real.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every arm prompt carries the same goal text', () => {
  for (const target of ['routing', 'locate']) {
    const goal = goalText(target);
    assert.ok(goal.includes('`node score.mjs`'));
    for (const arm of Object.keys(ARMS)) assert.ok(armPrompt(arm, target).includes(goal));
  }
  assert.equal(armPrompt('improve-opus', 'routing'), `/exo:improve ${goalText('routing')}`);
  assert.equal(armPrompt('goal-sonnet', 'locate'), `/goal ${goalText('locate')}; or stop when node score.mjs refuses`);
});

test('improve arms set the improve-round tier and load the copy as plugin', () => {
  const opus = armConfig({ arm: 'improve-opus', target: 'routing', cap: 1, scratch: '/copy' });
  const sonnet = armConfig({ arm: 'improve-sonnet', target: 'routing', cap: 1, scratch: '/copy' });
  assert.equal(opus.improveRoundTier, 'strong');
  assert.equal(sonnet.improveRoundTier, 'standard');
  assert.deepEqual(opus.args.slice(opus.args.indexOf('--plugin-dir')), ['--plugin-dir', '/copy']);
  assert.deepEqual(opus.env, {});
  assert.equal(opus.args[opus.args.indexOf('--model') + 1], 'opus');
  assert.equal(sonnet.args[sonnet.args.indexOf('--model') + 1], 'sonnet');
});

test('goal arms run stock with the arm model on every subagent', () => {
  const config = armConfig({ arm: 'goal-opus', target: 'locate', cap: 0.25, scratch: '/copy' });
  assert.equal(config.improveRoundTier, null);
  assert.equal(config.args.includes('--plugin-dir'), false);
  assert.equal(config.args[config.args.indexOf('--max-budget-usd') + 1], '0.25');
  assert.deepEqual(config.env, { CLAUDE_CODE_SUBAGENT_MODEL: 'opus' });
});

test('withImproveRoundTier rewrites only the improve-round tier of the real model-kinds file', () => {
  const text = fs.readFileSync(path.join(REPO, 'lib/model-kinds.json'), 'utf8');
  const changed = withImproveRoundTier(text, 'strong');
  const before = JSON.parse(text);
  const after = JSON.parse(changed);
  assert.equal(after.kinds['improve-round'].on.tier, 'strong');
  assert.equal(after.kinds['improve-round'].on.effort, before.kinds['improve-round'].on.effort);
  after.kinds['improve-round'].on.tier = before.kinds['improve-round'].on.tier;
  assert.deepEqual(after, before);
  assert.throws(() => withImproveRoundTier('{}', 'strong'), /improve-round/);
});

test('projection adds the arm cap, the train calls and the held-out runs', () => {
  const projected = projectedSpend({ cap: 1, calls: 3, heldOutRuns: 2, sessions: { train: 6, heldOut: 4 }, sessionUsd: 0.03 });
  assert.ok(Math.abs(projected - (1 + 4 * 6 * 0.03 + 2 * 4 * 0.03)) < 1e-9);
});

test('scorer session counts come from the data files', () => {
  assert.deepEqual(scorerSessions(REPO, 'routing'), { train: 6, heldOut: 4 });
  assert.deepEqual(scorerSessions(REPO, 'locate'), { train: 6, heldOut: 4 });
  assert.ok(sessionUsd(REPO, 'routing') > 0);
});

test('dry run lists four arms, the total and the wall cap', () => {
  const options = parseOptions(['--dry-run']);
  const sessions = { train: 6, heldOut: 4 };
  const plan = dryRunPlan({ options, sessions, sessionUsd: 0.03 });
  assert.equal(plan.rows.length, 4);
  assert.ok(Math.abs(plan.total - 4 * projectedSpend({ cap: 1, calls: 3, heldOutRuns: 2, sessions, sessionUsd: 0.03 })) < 1e-9);
  const lines = dryRunLines({ options, sessions, sessionUsd: 0.03 });
  assert.ok(lines[0].startsWith('dry-run: quick tier'));
  assert.ok(lines.some((line) => line.startsWith('max spend $')));
});

test('options default to the quick tier and smoke narrows to one goal-sonnet arm', () => {
  const quick = parseOptions([]);
  assert.deepEqual([quick.target, quick.runs, quick.cap, quick.scoreCalls, quick.heldOutRuns], ['routing', 1, 1, 3, 2]);
  assert.deepEqual(quick.arms, Object.keys(ARMS));
  assert.equal(parseOptions(['--target', 'locate']).scoreCalls, 2);
  const smoke = parseOptions(['--smoke', '--cap', '0.25']);
  assert.deepEqual([smoke.arms, smoke.scoreCalls, smoke.heldOutRuns, smoke.cap], [['goal-sonnet'], 1, 1, 0.25]);
  assert.deepEqual(parseOptions(['--arm', 'goal-opus,improve-opus']).arms, ['goal-opus', 'improve-opus']);
  assert.throws(() => parseOptions(['--arm', 'nope']), /--arm takes/);
  assert.throws(() => parseOptions(['--target', 'x']), /--target takes/);
});

test('recorded arms and runs are skipped and spend adds the totals', () => {
  const runs = [{ target: 'routing', arm: 'goal-sonnet', run: 1, totalCost: 0.4 }, { target: 'locate', arm: 'goal-opus', run: 1, totalCost: 0.6 }];
  assert.equal(recordedKeys(runs).has(runKey({ target: 'routing', arm: 'goal-sonnet', run: 1 })), true);
  assert.equal(recordedKeys(runs).has(runKey({ target: 'routing', arm: 'goal-sonnet', run: 2 })), false);
  assert.equal(spentSoFar(runs), 1);
});

test('arm record sums the three spends and records gains against a baseline', () => {
  const record = armRecord({
    target: 'routing', arm: 'goal-sonnet', run: 1, cap: 0.25,
    session: { costUsd: 0.1, wallS: 30, killed: false, subtype: 'success' },
    bridge: { calls: 1, spend: 0.2, history: [{ n: 1, score: 0.5, spend: 0.2 }] },
    train: { mean: 0.6, spend: 0.2, scores: [0.6] },
    heldOut: { mean: 0.3, spend: 0.1, scores: [0.25, 0.35] },
    baseline: { routing: { train: 0.5, heldOut: 0.25 } },
    changedOutside: [], diffFile: 'x.diff', finalRef: 'working tree'
  });
  assert.ok(Math.abs(record.totalCost - 0.6) < 1e-9);
  assert.ok(Math.abs(record.gains.train - 0.1) < 1e-9);
  assert.ok(Math.abs(record.gains.heldOut - 0.05) < 1e-9);
  assert.deepEqual(record.heldOutScores, [0.25, 0.35]);
});

test('the dry run prints without touching the network or the out file', () => {
  const out = path.join(os.tmpdir(), `improve-real-nowrite-${process.pid}.json`);
  parseOptions(['--dry-run', '--out', out]);
  assert.equal(fs.existsSync(out), false);
});
