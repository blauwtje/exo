import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HEADLESS_LINE, MAKER_LINE, makerArguments, makerPrompt, runFailure, scoreDirectory, wrongCopyDirs } from '../benchmarks/ideas.mjs';
import { JUDGE_ARGUMENTS, addRarity, calibration, decisions, modalShare, runRecord } from '../benchmarks/ideas-score.mjs';

const IDEAS = path.join(import.meta.dirname, '..', 'benchmarks', 'ideas.mjs');
const CASES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'benchmarks', 'ideas', 'cases.json'), 'utf8'));
const STEERING = /\b(innovative|creative|original|novel|bold|unusual|museum)\b/i;

test('cases and the maker line hold no steering word', () => {
  for (const [id, spec] of Object.entries(CASES)) assert.doesNotMatch(spec.feature, STEERING, id);
  assert.doesNotMatch(`${MAKER_LINE} ${HEADLESS_LINE} ${makerPrompt('x')}`, STEERING);
});

test('dry mode prints one planned cell per case and run and spends nothing', () => {
  const run = spawnSync(process.execPath, [IDEAS, '--n', '2'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const planned = run.stdout.split('\n').filter((line) => line.startsWith('planned '));
  assert.equal(planned.length, 2 * Object.keys(CASES).length);
  assert.match(run.stdout, /nothing spent/);
});

test('metrics, rarity and modal share compute on fixed options', () => {
  const scored = (originality, fit) => ({ title: 't', mechanism: 'm', scores: { originality, fit } });
  const a = runRecord({ caseId: 'c', run: 1, options: [scored(5, 4), scored(2, 5), scored(4, 3)], shapes: [0, 0, 1], recommended: 0 });
  const b = runRecord({ caseId: 'c', run: 2, options: [scored(1, 5)], shapes: [0], recommended: 0 });
  assert.equal(a.options, 3);
  assert.equal(a.shapes, 2);
  assert.ok(Math.abs(a.duplicateShare - 1 / 3) < 1e-9);
  assert.equal(a.strong, 1);
  assert.ok(Math.abs(a.originality - 11 / 3) < 1e-9);
  addRarity([a, b]);
  assert.equal(a.rare, 0.5);
  assert.equal(b.rare, 0);
  assert.equal(modalShare({ records: [a, b], shapes: [0, 0, 1, 0] }), 1);
});

test('calibration passes at 80 percent within one and fails below', () => {
  const key = { originality: 1, fit: 5 };
  const near = { key, got: { originality: 2, fit: 5 } };
  const far = { key, got: { originality: 4, fit: 5 } };
  assert.equal(calibration([near, near, near, far, far, far]).passed, false);
  assert.equal(calibration([near, near, near, near, far]).passed, true);
  assert.equal(calibration([near, { key, got: null }]).passed, false);
});

test('decision rule follows the pre-registered thresholds', () => {
  const low = decisions({ means: { shapes: 2, originality: 4, duplicateShare: 0.2, rare: 0.5 }, modal: 0.1 });
  assert.match(low[0], /A1.*: needed/);
  assert.match(low[1], /A2.*: needed/);
  assert.match(low[2], /A3.*: not needed/);
  const high = decisions({ means: { shapes: 4, originality: 3, duplicateShare: 0.1, rare: 0.1 }, modal: 0.2 });
  assert.match(high[0], /: not needed/);
  assert.match(high[2], /: needed/);
});

function fakeJudge(options, controlsOk) {
  const keys = new Map(Object.values(CASES).flatMap((spec) => spec.controls.map((c) => [c.title, c])));
  return ({ prompt }) => {
    if (prompt.startsWith('You read the final message')) {
      return JSON.stringify({ options: options.map((title) => ({ title, mechanism: `${title} mech` })), recommended: 0 });
    }
    if (prompt.startsWith('You group design options')) {
      const count = prompt.split('\n').filter((line) => /^\d+\. /.test(line)).length;
      return JSON.stringify({ shapes: [{ id: 0, label: 'x' }], assignments: Array.from({ length: count }, (_, option) => ({ option, shape: 0 })) });
    }
    const title = /Option: ([^:]+):/.exec(prompt.split('The problem and the option follow.')[1])[1];
    const key = keys.get(title);
    if (key) return JSON.stringify({ originality: controlsOk ? key.originality : 6 - key.originality, fit: key.fit });
    return JSON.stringify({ originality: 4, fit: 4 });
  };
}

async function scoreWith(controlsOk) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-test-'));
  for (const caseId of Object.keys(CASES)) {
    const folder = path.join(dir, 'base', caseId, '1');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'final.md'), 'options here');
  }
  const results = path.join(dir, 'results.md');
  await scoreDirectory({ dir, arm: 'base', judge: fakeJudge(['alpha', 'beta'], controlsOk), results });
  return { text: fs.readFileSync(results, 'utf8'), dir };
}

test('score writes a results file with calibration, MDE and decisions', async () => {
  const { text, dir } = await scoreWith(true);
  assert.match(text, /calibrated/);
  assert.doesNotMatch(text, /judge uncalibrated/);
  assert.match(text, /Decision rule, fixed before any score/);
  assert.match(text, /\| strong \| 2 \|/);
  assert.match(text, /A1 wider sketch.*: needed .mean shapes 1,/);
  assert.ok(fs.existsSync(path.join(dir, 'base', 'records.json')));
});

test('a miscalibrated judge marks the file and draws no decision', async () => {
  const { text } = await scoreWith(false);
  assert.match(text, /judge uncalibrated/);
  assert.match(text, /none drawn/);
});

test('a run that loaded a skill from another copy is flagged', () => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-arm-'));
  const event = (dir) => JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: `Base directory for this skill: ${dir}` }] } });
  const stdout = [event(path.join(plugin, 'skills', 'spec')), event('/elsewhere/exo/skills/spec')].join('\n');
  assert.deepEqual(wrongCopyDirs(stdout, plugin), ['/elsewhere/exo/skills/spec']);
});

test('a maker run that crashed, timed out or ended without an answer is failed; an answer without options is not', () => {
  const answered = JSON.stringify({ type: 'result', result: 'I decided to keep it as is.' });
  assert.equal(runFailure({ stdout: answered, exitCode: 0 }), null);
  assert.match(runFailure({ stdout: answered, exitCode: 1 }), /exit code 1/);
  assert.match(runFailure({ stdout: '', exitCode: null, signal: 'SIGKILL', timedOut: true, timeoutMs: 5 }), /timed out after 5 ms/);
  assert.match(runFailure({ stdout: JSON.stringify({ type: 'assistant' }), exitCode: 0 }), /no final assistant text/);
});

test('failed runs are listed in the results and left out of metrics and n', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-test-'));
  const ids = Object.keys(CASES);
  for (const caseId of ids) {
    for (const run of ['1', '2']) {
      const folder = path.join(dir, 'base', caseId, run);
      fs.mkdirSync(folder, { recursive: true });
      if (caseId === ids[0] && run === '2') fs.writeFileSync(path.join(folder, 'failed.json'), JSON.stringify({ reason: 'exit code 1' }));
      else fs.writeFileSync(path.join(folder, 'final.md'), 'options here');
    }
  }
  const results = path.join(dir, 'results.md');
  await scoreDirectory({ dir, arm: 'base', judge: fakeJudge(['alpha', 'beta'], true), results });
  const text = fs.readFileSync(results, 'utf8');
  const scoredRuns = ids.length * 2 - 1;
  assert.match(text, new RegExp(`Failed runs, left out of every metric and n: ${ids[0]}/2 \\(exit code 1\\)`));
  assert.match(text, new RegExp(`\\| options \\| 2 \\| 0 \\| ${scoredRuns} \\|`));
  const records = JSON.parse(fs.readFileSync(path.join(dir, 'base', 'records.json'), 'utf8'));
  assert.equal(records.length, scoredRuns);
  assert.ok(!records.some((record) => record.case === ids[0] && record.run === 2));
});

test('judge calls skip user settings and load no plugin; maker calls load only the arm copy', () => {
  const sources = (args) => args[args.indexOf('--setting-sources') + 1];
  assert.equal(sources(JUDGE_ARGUMENTS), 'project,local');
  assert.ok(!JUDGE_ARGUMENTS.includes('--plugin-dir') && !JUDGE_ARGUMENTS.includes('--settings'));
  const maker = makerArguments({ prompt: 'p', plugin: '/arm/copy' });
  assert.equal(sources(maker), 'project,local');
  assert.deepEqual(maker.flatMap((arg, at) => (arg === '--plugin-dir' ? [maker[at + 1]] : [])), ['/arm/copy']);
});
