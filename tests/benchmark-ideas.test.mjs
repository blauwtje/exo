import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HEADLESS_LINE, MAKER_LINE, assertSameJudge, caseMeans, compareToBaseline, makerArguments, makerPrompt, projectedCostLine, rawRecordsFile, recordedCosts, runFailure, scoreDirectory, unpricedRuns, usageOf, wrongCopyDirs } from '../benchmarks/ideas.mjs';
import { JUDGE_ARGUMENTS, JUDGE_HASH, addRarity, calibration, compareMarkdown, decisions, extractRun, modalShare, resultsMarkdown, runRecord, scoreOption } from '../benchmarks/ideas-score.mjs';

const IDEAS = path.join(import.meta.dirname, '..', 'benchmarks', 'ideas.mjs');
const CASES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'benchmarks', 'ideas', 'cases.json'), 'utf8'));
const STEERING = /\b(innovative|creative|original|novel|bold|unusual|museum)\b/i;

test('cases and the maker line hold no steering word', () => {
  for (const [id, spec] of Object.entries(CASES)) assert.doesNotMatch(spec.feature, STEERING, id);
  assert.doesNotMatch(`${MAKER_LINE} ${HEADLESS_LINE} ${makerPrompt('x')}`, STEERING);
});

test('the default plans one quick answer per case, --full plans five, an explicit --n wins', () => {
  const planned = (...args) => spawnSync(process.execPath, [IDEAS, ...args], { encoding: 'utf8' }).stdout.split('\n').filter((line) => line.startsWith('planned '));
  const cases = Object.keys(CASES).length;
  assert.equal(planned().length, cases);
  assert.ok(planned().every((line) => line.includes('(quick)')));
  assert.equal(planned('--full').length, 5 * cases);
  assert.ok(planned('--full').every((line) => line.includes('(full)')));
  assert.equal(planned('--full', '--n', '2').length, 2 * cases);
});

test('caseMeans averages each metric per case, skipping null values', () => {
  const means = caseMeans([{ case: 'a', run: 1, fit: 2, costUsd: null }, { case: 'a', run: 2, fit: 4, costUsd: 1 }, { case: 'b', run: 1, fit: 5, costUsd: null }]);
  assert.deepEqual(means, [{ case: 'a', fit: 3, costUsd: 1 }, { case: 'b', fit: 5, costUsd: null }]);
});

test('compareToBaseline reads the stored base arm and prints each side\'s run count above the table', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-baseline-'));
  const stored = ['tide', 'shopping', 'notes'].flatMap((id) => [1, 2, 3, 4, 5].map((run) => ({ case: id, run, judge: JUDGE_HASH, fit: 3, originality: 2 })));
  savedRecords(dir, 'base', JSON.stringify(stored));
  const text = compareToBaseline({ baselineDir: dir, records: [{ case: 'tide', run: 1, judge: JUDGE_HASH, fit: 4, originality: 2 }] });
  assert.match(text, /^runs: baseline 15 \(per-case mean of 3 cases\), new 1\n/);
  assert.match(text, /\| metric \| diff \| se \| ci95 \| cases paired \| verdict \|/);
  assert.match(text, /\| fit \| /);
});

test('a compare needs both sides scored by the same judge prompts', () => {
  const side = (judge) => [{ case: 'tide', run: 1, ...(judge === undefined ? {} : { judge }), fit: 3 }];
  assert.doesNotThrow(() => assertSameJudge({ left: side('a'), right: side('a') }));
  assert.throws(() => assertSameJudge({ left: side('a'), right: side('b') }), /rescore the baseline with --score/);
  assert.throws(() => assertSameJudge({ left: side(undefined), right: side('a') }), /rescore the baseline with --score/);
  assert.throws(() => assertSameJudge({ left: side('a'), right: side(undefined) }), /rescore the baseline with --score/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-baseline-'));
  savedRecords(dir, 'base', JSON.stringify(side(undefined)));
  assert.throws(() => compareToBaseline({ baselineDir: dir, records: side(JUDGE_HASH) }), /rescore the baseline with --score/);
});

test('--compare of folders with different or missing judges exits 2', () => {
  const folder = (judge) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-compare-'));
    savedRecords(dir, 'base', JSON.stringify([{ case: 'tide', run: 1, ...(judge === undefined ? {} : { judge }), fit: 3 }]));
    return path.join(dir, 'base');
  };
  const compare = (a, b) => spawnSync(process.execPath, [IDEAS, '--compare', a, b], { encoding: 'utf8' });
  const same = compare(folder('a'), folder('a'));
  assert.equal(same.status, 0);
  const differs = compare(folder('a'), folder('b'));
  assert.equal(differs.status, 2);
  assert.match(differs.stderr, /rescore the baseline with --score/);
  assert.equal(compare(folder(undefined), folder('a')).status, 2);
});

test('runRecord stores the judge hash of the originality and fit prompts', () => {
  assert.match(runRecord({ caseId: 'c', run: 1, options: [], shapes: [], recommended: null }).judge, /^[0-9a-f]{64}$/);
});

test('--baseline without --score is a usage error', () => {
  const run = spawnSync(process.execPath, [IDEAS, '--baseline', os.tmpdir()], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--baseline needs --score/);
});

test('dry mode prints one planned cell per case and run and spends nothing', () => {
  const run = spawnSync(process.execPath, [IDEAS, '--n', '2'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const planned = run.stdout.split('\n').filter((line) => line.startsWith('planned '));
  assert.equal(planned.length, 2 * Object.keys(CASES).length);
  assert.match(run.stdout, /nothing spent/);
});

function savedRecords(out, arm, records) {
  fs.mkdirSync(path.join(out, arm), { recursive: true });
  fs.writeFileSync(path.join(out, arm, 'records.json'), records);
}

test('recordedCosts reads costUsd from the arm records file, skipping null costs and a missing file, and throws on an unreadable one', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-costs-'));
  savedRecords(out, 'base', JSON.stringify([{ costUsd: 1 }, { costUsd: 3 }, { costUsd: null }, {}]));
  savedRecords(out, 'broken', '{not json');
  assert.deepEqual(recordedCosts(out, 'base'), [1, 3]);
  assert.throws(() => recordedCosts(out, 'broken'), SyntaxError);
  assert.deepEqual(recordedCosts(out, 'absent'), []);
});

test('projectedCostLine multiplies planned cells by the median recorded USD, else cost unknown', () => {
  assert.equal(projectedCostLine(10, [1, 3, 8]), 'projected cost: $30.00 (10 cells x median $3.0000 of 3 recorded runs, 0 without cost excluded)');
  assert.equal(projectedCostLine(10, [1, 3, 8], 2), 'projected cost: $30.00 (10 cells x median $3.0000 of 3 recorded runs, 2 without cost excluded)');
  assert.equal(projectedCostLine(10, []), 'projected cost: cost unknown, 0 recorded runs without cost excluded');
});

test('dry mode projects cost from the records file of --out, else prints cost unknown', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-dry-'));
  const ideas = () => spawnSync(process.execPath, [IDEAS, '--n', '1', '--out', out], { encoding: 'utf8' });
  const cells = Object.keys(CASES).length;
  assert.match(ideas().stdout, /projected cost: cost unknown/);
  assert.match(ideas().stdout, /0 recorded runs without cost excluded/);
  savedRecords(out, 'base', JSON.stringify([{ costUsd: 2 }]));
  assert.match(ideas().stdout, new RegExp(`projected cost: \\$${(2 * cells).toFixed(2).replace('.', '\\.')} `));
  assert.match(ideas().stdout, /nothing spent/);
});

test('--dry-run plans only, even with --confirm, and exits 0 without a run', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-dry-confirm-'));
  const run = spawnSync(process.execPath, [IDEAS, '--confirm', '--dry-run', '--out', out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /nothing spent/);
  assert.deepEqual(fs.readdirSync(out), []);
});

test('unpricedRuns counts recorded runs without a numeric cost', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-unpriced-'));
  savedRecords(out, 'base', JSON.stringify([{ costUsd: 1 }, { costUsd: null }, {}]));
  assert.equal(unpricedRuns(out, 'base'), 2);
  assert.equal(unpricedRuns(out, 'absent'), 0);
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
  assert.equal(modalShare({ records: [a, b] }), 1);
});

test('modal share is the share of runs recommending the most common recommended shape', () => {
  // notes baseline: shape 3 is recommended by all five runs but is not the most common shape over all options.
  const notes = [1, 2, 3, 4, 5].map((run) => ({ recommendedShape: 3, run }));
  assert.equal(modalShare({ records: notes }), 1);
  const shopping = [0, 3, 0, 0, 0].map((recommendedShape) => ({ recommendedShape }));
  assert.equal(modalShare({ records: shopping }), 0.8);
  assert.equal(modalShare({ records: [{ recommendedShape: null }] }), null);
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

const GOOD_ANSWER = '1. alpha: a first design\n2. beta: a second design';
const BAD_ANSWER = 'I decided to keep it as is.';

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
    const dimension = /on one scale: (\w+)/.exec(prompt)[1];
    if (key) return JSON.stringify({ [dimension]: dimension === 'originality' && !controlsOk ? 6 - key.originality : key[dimension] });
    return JSON.stringify({ [dimension]: 4 });
  };
}

async function scoreWith(controlsOk) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-test-'));
  for (const caseId of Object.keys(CASES)) {
    const folder = path.join(dir, 'base', caseId, '1');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'final.md'), GOOD_ANSWER);
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

test('score keeps the raw maker answers beside the results file so a later judge can rescore them', async () => {
  const { dir } = await scoreWith(true);
  const kept = JSON.parse(fs.readFileSync(rawRecordsFile(path.join(dir, 'results.md')), 'utf8'));
  assert.equal(kept.arm, 'base');
  assert.equal(kept.runs.length, Object.keys(CASES).length);
  assert.ok(kept.runs.every((run) => run.finalText === GOOD_ANSWER && run.run === 1));
  assert.equal(kept.records.length, kept.runs.length);
  assert.equal(rawRecordsFile('/r/2026-10-20-ideas-base.md'), '/r/2026-10-20-ideas-base.records.json');
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
  for (const [caseId, run] of ids.flatMap((id) => ['1', '2'].map((number) => [id, number]))) {
    const folder = path.join(dir, 'base', caseId, run);
    fs.mkdirSync(folder, { recursive: true });
    const failed = caseId === ids[0] && run === '2';
    const [file, content] = failed ? ['failed.json', JSON.stringify({ reason: 'exit code 1' })] : ['final.md', GOOD_ANSWER];
    fs.writeFileSync(path.join(folder, file), content);
  }
  const results = path.join(dir, 'results.md');
  await scoreDirectory({ dir, arm: 'base', judge: fakeJudge(['alpha', 'beta'], true), results });
  const text = fs.readFileSync(results, 'utf8');
  const scoredRuns = ids.length * 2 - 1;
  assert.match(text, new RegExp(`Failed runs, counted as failures 1 of \\d+, left out of every metric and n: ${ids[0]}/2 \\(exit code 1\\)`));
  assert.match(text, new RegExp(`\\| options \\| 2 \\| 0 \\| 2\\.\\.2 \\| 0 \\| ${scoredRuns} \\|`));
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

test('the recommended option and the run cost are read from a fixture, absent as null', () => {
  const scored = (originality, fit) => ({ title: 't', mechanism: 'm', scores: { originality, fit } });
  const options = [scored(5, 4), scored(2, 5), scored(4, 3)];
  const run = runRecord({ caseId: 'c', run: 1, options, shapes: [0, 0, 1], recommended: 2, tokens: 1530, costUsd: 0.5 });
  assert.deepEqual([run.recommendedOriginality, run.recommendedFit, run.tokens, run.costUsd], [4, 3, 1530, 0.5]);
  const bare = runRecord({ caseId: 'c', run: 2, options, shapes: [0, 0, 1], recommended: null });
  assert.deepEqual([bare.recommendedOriginality, bare.recommendedFit, bare.tokens, bare.costUsd], [null, null, null, null]);
  const result = (extra) => `{"type":"system"}\n${JSON.stringify({ type: 'result', ...extra })}`;
  const usage = { input_tokens: 8, output_tokens: 1522, cache_creation_input_tokens: 10, cache_read_input_tokens: 100 };
  const row = { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 3, cacheReadInputTokens: 4 };
  assert.deepEqual(usageOf(result({ usage, total_cost_usd: 0.25 })), { tokens: 1640, costUsd: 0.25 });
  assert.deepEqual(usageOf(result({ usage, modelUsage: { a: row, b: row } })), { tokens: 20, costUsd: null });
  assert.deepEqual(usageOf('{"type":"result"}'), { tokens: null, costUsd: null });
});

test('a metric with sd 0 prints no MDE, is named at a floor or ceiling, and a compare against it reads no SE (sd 0), not a rise', () => {
  const record = (id, strong, fit) => ({ case: id, run: 1, options: 4, shapes: 4, duplicateShare: 0, originality: 1, fit, strong, rare: 0, recommendedShape: 0 });
  const base = [record('a', 0, 3), record('b', 0, 4), record('c', 0, 3.5)];
  const text = resultsMarkdown({ arm: 'base', records: base, caseShares: { c: 1 }, verdict: { share: 1, passed: true }, unscored: [] });
  assert.match(text, /\| strong \| 0 \| 0 \| 0\.\.0 \| 0 \| 3 \| 0 \| n\/a \(sd 0\) \|/);
  assert.doesNotMatch(text, /\| fit \|[^\n]*n\/a/);
  assert.match(text, /At a floor or ceiling \(sd 0, no detectable effect\): strong 0, options 4, shapes 4, duplicateShare 0, originality 1, rare 0\n/);
  const variant = [record('a', 1, 3), record('b', 1, 4), record('c', 1, 3.5)];
  const table = compareMarkdown({ left: base, right: variant });
  assert.match(table, /\| strong \| 1 \| 0 \| 1\.\.1 \| 3 \| no SE \(sd 0\) \|/);
  assert.match(table, /\| fit \| 0 \| 0 \| 0\.\.0 \| 3 \| noise \|/);
  assert.doesNotMatch(table, /\| strong \|[^\n]*rise/);
});

test('a compare is paired per case: a steady gain across cases reads rise, one shared case reads no SE', () => {
  const records = (gains) => gains.map((gain, index) => ({ case: `c${index}`, run: 1, fit: 3 + gain + index * 0.1 }));
  const left = records([0, 0, 0, 0]);
  const rise = compareMarkdown({ left, right: records([1, 1.1, 0.9, 1]) });
  assert.match(rise, /\| fit \| 1 \| [^\n]* \| 4 \| rise \|/);
  const fall = compareMarkdown({ left, right: records([-1, -1.1, -0.9, -1]) });
  assert.match(fall, /\| fit \| -1 \| [^\n]* \| 4 \| fall \|/);
  const noisy = compareMarkdown({ left, right: records([1, -1, 1, -1]) });
  assert.match(noisy, /\| fit \| 0 \| [^\n]* \| 4 \| noise \|/);
  const single = compareMarkdown({ left: left.slice(0, 1), right: records([1]) });
  assert.match(single, /\| fit \| 1 \| no SE \| no SE \| 1 \| no SE \|/);
});

test('results print a case-clustered SE and CI per metric, an excluded count, and the failure share', () => {
  const record = (id, fit, costUsd) => ({ case: id, run: 1, options: 2, shapes: 2, duplicateShare: 0, originality: 3, fit, strong: 0, rare: 0, recommendedShape: 0, costUsd });
  const records = [record('a', 2, 1), record('b', 4, null), record('c', 3, 2)];
  const text = resultsMarkdown({ arm: 'base', records, caseShares: { a: 1 }, verdict: { share: 1, passed: true }, unscored: [], failed: ['d/1 (exit code 1)'], stability: { agree: 5, total: 6 } });
  assert.match(text, /\| fit \| 3 \| 0\.577 \| 1\.868\.\.4\.132 \| 1 \| 3 \| 0 \|/);
  assert.match(text, /\| costUsd \| 1\.5 \| 0\.5 \| [^\n]* \| 0\.707 \| 2 \| 1 \|/);
  assert.match(text, /counted as failures 1 of 4/);
  assert.match(text, /Judge vote stability: 5 of 6 scored options had 3 identical votes/);
});

test('scoreOption asks each dimension in its own prompt, takes the median of three votes and reports whether all six agreed', async () => {
  const prompts = [];
  const votes = (originality, fit) => {
    const queue = [...originality.map((value) => ({ originality: value })), ...fit.map((value) => ({ fit: value }))];
    return ({ prompt }) => {
      prompts.push(prompt);
      return JSON.stringify(queue.shift());
    };
  };
  const option = { title: 't', mechanism: 'm' };
  const steady = await scoreOption({ judge: votes([4, 4, 4], [3, 3, 3]), problem: 'p', option });
  assert.deepEqual(steady, { originality: 4, fit: 3, agree: true });
  assert.equal(prompts.length, 6);
  assert.ok(prompts.slice(0, 3).every((prompt) => /on one scale: originality/.test(prompt) && !/on one scale: fit/.test(prompt)));
  assert.ok(prompts.slice(3).every((prompt) => /on one scale: fit/.test(prompt) && !/on one scale: originality/.test(prompt)));
  const split = await scoreOption({ judge: votes([2, 4, 5], [3, 3, 3]), problem: 'p', option });
  assert.deepEqual(split, { originality: 4, fit: 3, agree: false });
});

test('an answer with no parsable option fails before any judge call; a listed answer reaches the judge', async () => {
  let calls = 0;
  const judge = (input) => {
    calls += 1;
    return fakeJudge(['alpha', 'beta'], true)(input);
  };
  const bad = await extractRun({ judge, finalText: BAD_ANSWER });
  assert.deepEqual([bad.failed, bad.options.length, calls], [true, 0, 0]);
  const empty = await extractRun({ judge, finalText: '' });
  assert.deepEqual([empty.failed, calls], [true, 0]);
  const good = await extractRun({ judge, finalText: GOOD_ANSWER });
  assert.deepEqual([good.failed, good.options.length, calls], [false, 2, 1]);
});

test('a run whose answer has no parsable option is listed as unscored', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-test-'));
  const ids = Object.keys(CASES);
  for (const caseId of ids) {
    const folder = path.join(dir, 'base', caseId, '1');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'final.md'), caseId === ids[0] ? BAD_ANSWER : GOOD_ANSWER);
  }
  const results = path.join(dir, 'results.md');
  await scoreDirectory({ dir, arm: 'base', judge: fakeJudge(['alpha', 'beta'], true), results });
  assert.match(fs.readFileSync(results, 'utf8'), new RegExp(`Unscored items: ${ids[0]}/1 extract`));
});
