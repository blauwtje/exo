import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { reproGreen, startCommit } from '../benchmarks/bisect-repo.mjs';
import { poolMetric, summarize, verdictOf } from '../benchmarks/bisect-summary.mjs';
import { validateCase } from '../benchmarks/bisect-validate.mjs';
import { causeNamed, cellRecord, claudeArguments, defaultPaths, latestRecords, loadCases, main, parseArguments, pendingCells, planCells, promptFor, readRecords, pluginKey, schedule, scopeRecords, selectCases, spendCap, streamFacts, withStreamFacts } from '../benchmarks/bisect.mjs';

const SHAS = { before: 'bbb', after: 'aaa' };

function temporaryFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bisect-test-'));
}

function buildScript({ commits, breakAt }) {
  return [
    "import { execFileSync } from 'node:child_process';",
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    'const destination = process.argv[2];',
    'fs.mkdirSync(destination, { recursive: true });',
    "const identity = { GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.com', GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.com' };",
    'function git(date, ...args) {',
    "  execFileSync('git', ['-C', destination, ...args], { env: { ...process.env, ...identity, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, stdio: 'ignore' });",
    '}',
    "git('2020-01-01T00:00:00Z', 'init', '-q', '-b', 'main');",
    `for (let index = 1; index <= ${commits}; index += 1) {`,
    `  const state = index >= ${breakAt} ? 'bad' : 'good';`,
    "  fs.writeFileSync(path.join(destination, 'state.txt'), `${state}\\n`);",
    "  fs.writeFileSync(path.join(destination, `file-${index}.txt`), `${index}\\n`);",
    "  const date = `2020-01-01T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`;",
    "  git(date, 'add', '-A');",
    `  git(date, 'commit', '-q', '-m', index === ${breakAt} ? 'break the state' : \`change \${index}\`);`,
    '}',
    ''
  ].join('\n');
}

function writeCase(root, slug, { kind = 'regression', tier = 'quick', commits = 32, breakAt = 20, repro = 'grep -q good state.txt', culprit } = {}) {
  const directory = path.join(root, slug);
  fs.mkdirSync(directory, { recursive: true });
  const spec = { kind, tier, repro, culprit: culprit === undefined ? (kind === 'regression' ? 'break the state' : null) : culprit, timeoutMinutes: 5 };
  fs.writeFileSync(path.join(directory, 'case.json'), JSON.stringify(spec));
  fs.writeFileSync(path.join(directory, 'prompt.md'), 'It used to work, now it is broken.\n');
  fs.writeFileSync(path.join(directory, 'build.mjs'), buildScript({ commits, breakAt }));
  return directory;
}

function specOf(root, slug) {
  return loadCases(root).find((spec) => spec.slug === slug);
}

function record(name, arm, run, extra = {}) {
  return { case: name, kind: 'regression', arm, run, beforeSha: SHAS.before, afterSha: SHAS.after, promptMode: 'skill', wallMs: 1000, total_cost_usd: 1, modelTurns: 10, pass: true, bisectRan: false, ...extra };
}

function streamOf(...messages) {
  return messages.map((message) => JSON.stringify(message)).join('\n');
}

function assistant(id, ...parts) {
  return { type: 'assistant', message: { id, content: parts } };
}

function bash(command) {
  return { type: 'tool_use', name: 'Bash', input: { command } };
}

function capture(run) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  return run().finally(() => { console.log = original; }).then((result) => ({ result, lines }));
}

test('defaults: quick tier, 3 runs, both arms, 4 cells at once, $2 a cell', () => {
  const options = parseArguments([]);
  assert.equal(options.quick, true);
  assert.equal(options.runs, 3);
  assert.deepEqual(options.arms, ['exo-before', 'exo']);
  assert.equal(options.concurrency, 4);
  assert.equal(options.maxBudgetUsd, 2);
  assert.equal(options.maxTotalUsd, null);
  assert.equal(options.beforePlugin, null);
  assert.equal(options.caseNames, null);
});

test('prompt mode defaults to skill, takes natural and rejects others', () => {
  assert.equal(parseArguments([]).promptMode, 'skill');
  assert.equal(parseArguments(['--prompt-mode', 'natural']).promptMode, 'natural');
  assert.throws(() => parseArguments(['--prompt-mode', 'loud']), /--prompt-mode/);
  assert.throws(() => parseArguments(['--prompt-mode']), /--prompt-mode/);
});

test('skill mode prefixes the find-cause command, natural sends the bug report verbatim', () => {
  const spec = { prompt: 'It broke.\n' };
  assert.equal(promptFor(spec, 'skill'), '/exo:find-cause It broke.\n');
  assert.equal(promptFor(spec, 'natural'), 'It broke.\n');
  const args = claudeArguments({ prompt: promptFor(spec, 'skill'), options: { maxBudgetUsd: 2 }, pluginDir: '/p' });
  assert.equal(args[1], '/exo:find-cause It broke.\n');
});

test('prompt mode is part of the resume key, the scope and the summary', () => {
  const cells = planCells([{ slug: 'a' }], ['exo'], 1);
  const natural = record('a', 'exo', 1, { promptMode: 'natural' });
  const legacy = record('a', 'exo', 1, { promptMode: undefined });
  assert.equal(pendingCells(cells, [natural], SHAS, 'skill').length, 1);
  assert.equal(pendingCells(cells, [natural], SHAS, 'natural').length, 0);
  assert.equal(pendingCells(cells, [legacy], SHAS, 'natural').length, 0);
  const scope = { caseNames: null, arms: ['exo'], runs: 3 };
  assert.equal(scopeRecords([natural, record('a', 'exo', 2)], SHAS, { ...scope, promptMode: 'skill' }).length, 1);
  assert.equal(summarize([record('a', 'exo', 1, { skillFired: true }), record('a', 'exo', 2)], SHAS, 'skill').cases.a.arms.exo.skillFiredRate, 0.5);
});

test('flags parse and bad values throw', () => {
  const options = parseArguments(['--full', '--fresh', '--dry-run', '--cases', 'a,b', '--runs', '5', '--arms', 'exo', '--before-plugin', '/x', '--max-budget-usd', '1.5', '--max-total-usd', '9', '--concurrency', '2']);
  assert.deepEqual([options.quick, options.fresh, options.dryRun, options.runs, options.concurrency], [false, true, true, 5, 2]);
  assert.deepEqual(options.caseNames, ['a', 'b']);
  assert.deepEqual(options.arms, ['exo']);
  assert.equal(options.beforePlugin, '/x');
  assert.equal(options.maxBudgetUsd, 1.5);
  assert.equal(options.maxTotalUsd, 9);
  assert.throws(() => parseArguments(['--nope']), /unknown argument/);
  assert.throws(() => parseArguments(['--runs', '0']), /--runs/);
  assert.throws(() => parseArguments(['--runs', '1.5']), /whole number/);
  assert.throws(() => parseArguments(['--arms', 'baseline']), /--arms/);
  assert.throws(() => parseArguments(['--max-total-usd', 'x']), /positive/);
  assert.throws(() => parseArguments(['--concurrency']), /--concurrency/);
});

test('cases load and validate their case.json', () => {
  const root = temporaryFolder();
  assert.deepEqual(loadCases(path.join(root, 'absent')), []);
  writeCase(root, 'one');
  writeCase(root, 'two', { kind: 'plain', tier: 'full' });
  const cases = loadCases(root);
  assert.deepEqual(cases.map((spec) => [spec.slug, spec.flakyRuns]), [['one', 5], ['two', 5]]);
  assert.deepEqual(selectCases(cases, { quick: true, caseNames: null }).map((spec) => spec.slug), ['one']);
  assert.deepEqual(selectCases(cases, { quick: false, caseNames: null }).map((spec) => spec.slug), ['one', 'two']);
  assert.deepEqual(selectCases(cases, { quick: true, caseNames: ['two'] }).map((spec) => spec.slug), ['two']);
  assert.throws(() => selectCases(cases, { quick: true, caseNames: ['three'] }), /no such case: three/);
  writeCase(root, 'bad', { kind: 'regression', culprit: null });
  assert.throws(() => loadCases(root), /bad\/case.json: culprit/);
});

test('a folder without case.json is a helper, not a case', () => {
  const root = temporaryFolder();
  writeCase(root, 'one');
  fs.mkdirSync(path.join(root, 'lib'));
  fs.writeFileSync(path.join(root, 'lib', 'helper.mjs'), 'export {};\n');
  assert.deepEqual(loadCases(root).map((spec) => spec.slug), ['one']);
});

test('cells interleave arms inside each case and run', () => {
  const cases = [{ slug: 'a' }, { slug: 'b' }];
  const cells = planCells(cases, ['exo-before', 'exo'], 2);
  assert.equal(cells.length, 8);
  assert.deepEqual(cells.slice(0, 4).map(({ spec, arm, run }) => `${spec.slug}/${arm}/${run}`), ['a/exo-before/1', 'a/exo/1', 'b/exo-before/1', 'b/exo/1']);
});

test('a recorded cell with the same commit pair is skipped, another pair is not', () => {
  const cells = planCells([{ slug: 'a' }], ['exo-before', 'exo'], 2);
  const records = [record('a', 'exo', 1), record('a', 'exo-before', 2, { afterSha: 'other' })];
  const pending = pendingCells(cells, records, SHAS, 'skill');
  assert.deepEqual(pending.map(({ arm, run }) => `${arm}/${run}`), ['exo-before/1', 'exo-before/2', 'exo/2']);
});

test('the latest record per cell wins and scope drops other commits, arms and runs', () => {
  const records = [record('a', 'exo', 1, { wallMs: 1 }), record('a', 'exo', 1, { wallMs: 2 }), record('a', 'exo', 4), record('a', 'exo', 1, { afterSha: 'other' }), record('b', 'exo', 1)];
  assert.equal(latestRecords(records).length, 4);
  const scoped = scopeRecords(records, SHAS, { caseNames: ['a'], arms: ['exo'], runs: 3, promptMode: 'skill' });
  assert.deepEqual(scoped.map((entry) => entry.wallMs), [2]);
});

test('spend cap: quick 20, full remaining cells times the estimate, flag wins', () => {
  const pending = Array.from({ length: 10 });
  assert.equal(spendCap({ quick: true, maxTotalUsd: null }, pending), 20);
  assert.equal(spendCap({ quick: false, maxTotalUsd: null }, pending), 8);
  assert.equal(spendCap({ quick: false, maxTotalUsd: 3 }, pending), 3);
});

test('stream facts count distinct assistant ids, find bisect and read the result', () => {
  const text = streamOf(
    assistant('m1', { type: 'text', text: 'hi' }),
    assistant('m1', bash('ls')),
    assistant('m2', bash('node skills/find-cause/scripts/bisect.mjs --good x')),
    { type: 'assistant', parent_tool_use_id: 't', message: { id: 'sub1', content: [bash('git status')] } },
    { type: 'result', subtype: 'success', duration_ms: 1234, num_turns: 7, total_cost_usd: 0.5, result: 'the culprit is abc' }
  );
  assert.deepEqual(streamFacts(text), { modelTurns: 3, bisectRan: true, durationMs: 1234, numTurns: 7, total_cost_usd: 0.5, estimatedCostUsd: null, skillFired: true, resultSubtype: 'success', reply: 'the culprit is abc' });
  assert.equal(streamFacts(streamOf(assistant('m1', bash('git bisect start')))).bisectRan, true);
  assert.equal(streamFacts(streamOf(assistant('m1', bash('git log')), { type: 'user', message: { content: 'git bisect' } })).bisectRan, false);
});

test('skillFired sees a Skill call, a command expansion or a read of a find-cause file', () => {
  const fired = (...messages) => streamFacts(streamOf(...messages)).skillFired;
  const skill = (name) => assistant('m1', { type: 'tool_use', name: 'Skill', input: { skill: name } });
  const read = (file) => assistant('m1', { type: 'tool_use', name: 'Read', input: { file_path: file } });
  assert.equal(fired(skill('exo:find-cause')), true);
  assert.equal(fired(skill('exo:build')), false);
  assert.equal(fired({ type: 'user', message: { content: [{ type: 'text', text: '<command-name>/exo:find-cause</command-name>' }] } }), true);
  assert.equal(fired({ type: 'user', message: { content: '<command-name>exo:find-cause</command-name>' } }), true);
  assert.equal(fired({ type: 'user', message: { content: '/exo:find-cause it broke' } }), false);
  assert.equal(fired(read('/p/exo/skills/find-cause/SKILL.md')), true);
  assert.equal(fired(read('/p/exo/skills/find-cause/references/bisect.md')), true);
  assert.equal(fired(read('/p/src/main.js')), false);
});

const BASH_SKILL_STREAM = [
  assistant('m1', { type: 'text', text: 'Reading the skill.' }),
  assistant('m2', bash('cat /p/exo/skills/find-cause/investigator-prompt.md')),
  assistant('m3', bash('node /p/exo/skills/find-cause/scripts/bisect.mjs --good abc')),
  { type: 'result', subtype: 'success', duration_ms: 10, num_turns: 3, total_cost_usd: 0.4, result: 'done' }
];

test('a run that reads the skill files through Bash counts as skillFired and bisectRan', () => {
  const facts = streamFacts(streamOf(...BASH_SKILL_STREAM));
  assert.equal(facts.skillFired, true);
  assert.equal(facts.bisectRan, true);
  const plain = streamFacts(streamOf(assistant('m1', bash('cat src/index.js')), assistant('m2', bash('git bisect start'))));
  assert.deepEqual([plain.skillFired, plain.bisectRan], [false, true]);
});

test('report recomputes skillFired and bisectRan from the saved streams and keeps records without one', () => {
  const directory = temporaryFolder();
  fs.writeFileSync(path.join(directory, 'a-exo-1-skill.jsonl'), streamOf(...BASH_SKILL_STREAM));
  fs.writeFileSync(path.join(directory, 'a-exo-2.jsonl'), streamOf(...BASH_SKILL_STREAM));
  fs.writeFileSync(path.join(directory, 'a-exo-3.jsonl'), streamOf(...BASH_SKILL_STREAM));
  const stale = { skillFired: false, bisectRan: false };
  const records = [record('a', 'exo', 1, stale), record('a', 'exo', 2, stale), record('a', 'exo', 3, { ...stale, promptMode: 'natural' }), record('a', 'exo', 4, stale)];
  const fixed = withStreamFacts(records, directory);
  assert.deepEqual(fixed.map((entry) => [entry.skillFired, entry.bisectRan]), [[true, true], [true, true], [false, false], [false, false]]);
});

test('a stream with no result leaves its fields null', () => {
  const facts = streamFacts('not json\n');
  assert.deepEqual(facts, { modelTurns: 0, bisectRan: false, skillFired: false, durationMs: null, numTurns: null, total_cost_usd: null, estimatedCostUsd: null, resultSubtype: null, reply: null });
});

test('causeNamed accepts the subject or a 7+ hex prefix of the culprit', () => {
  const culprit = { subject: 'Cache the parsed config', sha: '0123456789abcdef0123456789abcdef01234567' };
  assert.equal(causeNamed('Cause: cache the PARSED config.', culprit), true);
  assert.equal(causeNamed('Cause: commit 0123456.', culprit), true);
  assert.equal(causeNamed('Cause: commit 0123456789ABCDEF.', culprit), true);
  assert.equal(causeNamed('Cause: commit 012345.', culprit), false);
  assert.equal(causeNamed('Cause: commit 0123457.', culprit), false);
  assert.equal(causeNamed(null, culprit), false);
});

function stats(mean, sd, n) {
  return { mean, sd, n };
}

function entry(kind, before, after) {
  return { kind, arms: { 'exo-before': { wallMs: before }, exo: { wallMs: after } } };
}

test('pooled verdict sums the case differences against 2 SE', () => {
  const entries = [entry('regression', stats(100, 10, 4), stats(60, 10, 4)), entry('regression', stats(200, 20, 4), stats(150, 20, 4))];
  const pooled = poolMetric(entries, 'wallMs');
  assert.equal(pooled.sumBefore, 300);
  assert.equal(pooled.sumDiff, -90);
  assert.equal(pooled.relative, -0.3);
  assert.ok(Math.abs(pooled.se - Math.sqrt(100 / 4 + 100 / 4 + 400 / 4 + 400 / 4)) < 1e-9);
  assert.ok(Math.abs(pooled.band - 2 * pooled.se / 300) < 1e-9);
  assert.equal(pooled.verdict, 'fall');
});

test('verdict rules: rise, fall, noise, no SE', () => {
  assert.equal(verdictOf(10, 4), 'rise');
  assert.equal(verdictOf(-10, 4), 'fall');
  assert.equal(verdictOf(7, 4), 'noise');
  assert.equal(verdictOf(0, 0), 'noise');
  assert.equal(verdictOf(-1, 0), 'fall');
  assert.equal(verdictOf(5, null), 'no SE');
  assert.equal(poolMetric([entry('regression', stats(1, null, 1), stats(1, null, 1))], 'wallMs').verdict, 'no SE');
  assert.equal(poolMetric([], 'wallMs'), null);
});

test('summary pools regression cases and controls apart', () => {
  const records = [];
  for (const [index, wall] of [[1, 100], [2, 110], [3, 120]]) {
    records.push(record('r', 'exo-before', index, { wallMs: wall * 10 }), record('r', 'exo', index, { wallMs: wall * 5, bisectRan: true }));
    records.push(record('c', 'exo-before', index, { kind: 'never-worked', wallMs: wall }), record('c', 'exo', index, { kind: 'never-worked', wallMs: wall + 1 }));
  }
  const summary = summarize(records, SHAS, 'skill');
  assert.equal(summary.cases.r.arms.exo.bisectRanRate, 1);
  assert.equal(summary.cases.r.arms['exo-before'].wallMs.mean, 1100);
  assert.equal(summary.pooled.regression.wallMs.verdict, 'fall');
  assert.equal(summary.pooled.regression.wallMs.cases, 1);
  assert.equal(summary.pooled.controls.wallMs.sumDiff, 1);
  assert.equal(summary.pooled.controls.wallMs.verdict, 'noise');
});

test('schedule honours concurrency and stops starting cells at the cap', async () => {
  let active = 0;
  let peak = 0;
  const recorded = [];
  const play = async (cell) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { cell, total_cost_usd: cell % 2 === 0 ? null : 1 };
  };
  const outcome = await schedule({ cells: [1, 2, 3, 4, 5, 6, 7, 8], concurrency: 3, estimate: 1, cap: 5, play, onRecord: (entryRecord) => recorded.push(entryRecord) });
  assert.ok(peak <= 3);
  assert.equal(recorded.length, 5);
  assert.deepEqual(outcome.skipped, [6, 7, 8]);
  assert.equal(outcome.spent, 5);
});

test('schedule reports a failing cell after the running ones finish', async () => {
  const play = async (cell) => {
    if (cell === 2) throw new Error('boom');
    return { total_cost_usd: 1 };
  };
  await assert.rejects(schedule({ cells: [1, 2, 3, 4, 5], concurrency: 1, estimate: 1, cap: 50, play, onRecord: () => {} }), /boom/);
});

test('validate accepts a well-formed regression, plain and never-worked fixture', () => {
  const root = temporaryFolder();
  writeCase(root, 'regress');
  writeCase(root, 'plain', { kind: 'plain', breakAt: 1 });
  writeCase(root, 'never', { kind: 'never-worked', breakAt: 1 });
  for (const slug of ['regress', 'plain', 'never']) assert.deepEqual(validateCase(specOf(root, slug)), [], slug);
});

test('validate names each broken contract', () => {
  const root = temporaryFolder();
  writeCase(root, 'few', { commits: 10, breakAt: 5 });
  writeCase(root, 'green-head', { repro: 'true' });
  writeCase(root, 'wrong-subject', { culprit: 'no such subject' });
  writeCase(root, 'worked', { kind: 'never-worked' });
  writeCase(root, 'steady', { kind: 'flaky', breakAt: 1 });
  assert.match(validateCase(specOf(root, 'few')).join(), /10 commits, not 30-300/);
  assert.match(validateCase(specOf(root, 'green-head')).join(), /green at HEAD/);
  assert.match(validateCase(specOf(root, 'wrong-subject')).join(), /names 0 commits/);
  assert.match(validateCase(specOf(root, 'worked')).join(), /repro is green at/);
  assert.match(validateCase(specOf(root, 'steady')).join(), /one outcome in 20 runs/);
});

test('validate accepts a flaky repro that fails some runs and passes others', () => {
  const root = temporaryFolder();
  writeCase(root, 'coin', { kind: 'flaky', breakAt: 1, repro: '[ $(( $(od -An -N1 -tu1 /dev/urandom) % 2 )) -eq 0 ]' });
  assert.deepEqual(validateCase(specOf(root, 'coin')), []);
});

test('validate reports a build that fails', () => {
  const root = temporaryFolder();
  const directory = writeCase(root, 'broken');
  fs.writeFileSync(path.join(directory, 'build.mjs'), 'process.exit(3);\n');
  assert.match(validateCase(specOf(root, 'broken')).join(), /build.mjs failed/);
});

function commitFix(repo) {
  fs.writeFileSync(path.join(repo, 'state.txt'), 'good\n');
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-am', 'fix the state']);
}

function builtRepo(root) {
  writeCase(root, 'regress');
  const spec = specOf(root, 'regress');
  const repo = path.join(root, 'checkout');
  execFileSync(process.execPath, [path.join(spec.directory, 'build.mjs'), repo]);
  return { spec, repo, start: startCommit(repo) };
}

test('reproGreen counts a fix that builds on the start commit in the tree, a worktree or a branch', () => {
  const { spec, repo, start } = builtRepo(temporaryFolder());
  assert.equal(reproGreen(repo, spec, start), false);
  commitFix(repo);
  assert.equal(reproGreen(repo, spec, start), true);
  execFileSync('git', ['-C', repo, 'branch', 'fixed']);
  execFileSync('git', ['-C', repo, 'reset', '--hard', '--quiet', 'HEAD~16']);
  assert.equal(reproGreen(repo, spec, start), true);
  execFileSync('git', ['-C', repo, 'branch', '-D', 'fixed']);
  assert.equal(reproGreen(repo, spec, start), false);
});

test('reproGreen counts a linked worktree only when it descends from the start commit', () => {
  const { spec, repo, start } = builtRepo(temporaryFolder());
  const linked = path.join(path.dirname(repo), 'linked');
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', '--quiet', linked, 'HEAD~15']);
  assert.equal(reproGreen(repo, spec, start), false);
  execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', linked]);
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', '--quiet', linked, 'HEAD']);
  commitFix(linked);
  assert.equal(reproGreen(repo, spec, start), true);
});

test('reproGreen scores red when the session sits at a good commit, on a branch there or after main is reset back', () => {
  const { spec, repo, start } = builtRepo(temporaryFolder());
  execFileSync('git', ['-C', repo, 'branch', 'old', 'HEAD~15']);
  execFileSync('git', ['-C', repo, 'checkout', '--quiet', 'HEAD~15']);
  assert.equal(reproGreen(repo, spec, start), false);
  execFileSync('git', ['-C', repo, 'checkout', '--quiet', 'main']);
  execFileSync('git', ['-C', repo, 'reset', '--hard', '--quiet', 'HEAD~15']);
  assert.equal(reproGreen(repo, spec, start), false);
});

test('a cell with no reported cost gets one estimated from its assistant usage', () => {
  const { spec, repo, start } = builtRepo(temporaryFolder());
  const usage = { input_tokens: 1000000, output_tokens: 100000, cache_read_input_tokens: 0 };
  const turn = (id) => ({ type: 'assistant', message: { id, model: 'claude-sonnet-5-5', usage, content: [] } });
  const cell = { spec, arm: 'exo', run: 1 };
  const killed = streamFacts(streamOf(turn('m1'), turn('m1'), turn('m2')));
  const estimated = cellRecord({ cell, shas: SHAS, facts: killed, wallMs: 5, timedOut: true, culprit: { subject: 'x', sha: 'y' }, repo, start });
  assert.equal(estimated.costEstimated, true);
  assert.ok(Math.abs(estimated.total_cost_usd - 6) < 1e-9);
  const reported = cellRecord({ cell, shas: SHAS, facts: { ...killed, total_cost_usd: 0.5 }, wallMs: 5, timedOut: false, culprit: { subject: 'x', sha: 'y' }, repo, start });
  assert.deepEqual([reported.costEstimated, reported.total_cost_usd], [false, 0.5]);
  const empty = cellRecord({ cell, shas: SHAS, facts: streamFacts(''), wallMs: 5, timedOut: true, culprit: { subject: 'x', sha: 'y' }, repo, start });
  assert.deepEqual([empty.costEstimated, empty.total_cost_usd], [false, null]);
  assert.equal(estimated.reply, undefined);
});

test('the pooled cost mean includes an estimated cell', () => {
  const records = [1, 2].flatMap((run) => [record('r', 'exo-before', run, { total_cost_usd: 2 }), record('r', 'exo', run, { total_cost_usd: run === 1 ? 1 : 3, costEstimated: run === 2 })]);
  const cost = summarize(records, SHAS, 'skill').cases.r.arms.exo.total_cost_usd;
  assert.equal(cost.n, 2);
  assert.equal(cost.mean, 2);
});

test('main --dry-run lists the pending cells and skips recorded ones', async () => {
  const root = temporaryFolder();
  writeCase(root, 'regress');
  const paths = defaultPaths(path.join(root), path.join(root, 'results'));
  const { result, lines } = await capture(() => main(['--dry-run', '--arms', 'exo', '--runs', '2'], paths));
  assert.equal(result, 0);
  assert.deepEqual(lines.slice(0, 2), ['planned exo regress run 1', 'planned exo regress run 2']);
  assert.match(lines[2], /tier quick, prompt skill, 2 cells \(0 already recorded\).*cap \$20/);
  assert.equal(readRecords(paths.records).length, 0);
});

test('main --dry-run with no cases prints zero cells', async () => {
  const root = temporaryFolder();
  const { result, lines } = await capture(() => main(['--dry-run', '--arms', 'exo'], defaultPaths(path.join(root, 'none'), root)));
  assert.equal(result, 0);
  assert.match(lines[0], /0 cells/);
});

test('main --validate checks every case, any tier, and exits 1 on a failure', async () => {
  const root = temporaryFolder();
  writeCase(root, 'regress', { tier: 'full' });
  const paths = defaultPaths(root, path.join(root, 'results'));
  const good = await capture(() => main(['--validate'], paths));
  assert.equal(good.result, 0);
  assert.deepEqual(good.lines, ['ok regress (regression)', '1 of 1 cases valid']);
  writeCase(root, 'few', { commits: 10, breakAt: 5 });
  const bad = await capture(() => main(['--validate', '--cases', 'few'], paths));
  assert.equal(bad.result, 1);
  assert.match(bad.lines[0], /FAIL few: 10 commits/);
});

test('the arm key is the newest plugin commit, so benchmark-only commits and untracked results keep it', async () => {
  const root = temporaryFolder();
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  for (const folder of ['skills', 'benchmarks', 'tests', 'benchmarks/results']) fs.mkdirSync(path.join(root, folder), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'a.md'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'plugin');
  const plugin = git('rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(root, 'benchmarks', 'b.mjs'), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'bench only');
  fs.writeFileSync(path.join(root, 'benchmarks', 'results', 'new.jsonl'), 'x\n');
  assert.equal(pluginKey(root), plugin);
  fs.writeFileSync(path.join(root, 'skills', 'a.md'), 'two\n');
  assert.equal(pluginKey(root), `${plugin}-dirty`);
});

test('main --report prints the summary of the latest commit pair and writes it', async () => {
  const root = temporaryFolder();
  const paths = defaultPaths(root, root);
  const records = [];
  for (const run of [1, 2]) {
    records.push(record('r', 'exo-before', run, { wallMs: 1000 * run }), record('r', 'exo', run, { wallMs: 500 * run }));
  }
  fs.writeFileSync(paths.records, `${records.map((entryRecord) => JSON.stringify(entryRecord)).join('\n')}\n`);
  const { result, lines } = await capture(() => main(['--report'], paths));
  assert.equal(result, 0);
  assert.match(lines[0], /prompt skill, before bbb after aaa, 4 cells/);
  assert.ok(lines.some((line) => line.startsWith('pooled regression wallMs')));
  const written = JSON.parse(fs.readFileSync(paths.summary, 'utf8'));
  assert.deepEqual(Object.keys(written), ['skill', 'natural']);
  assert.equal(written.skill.cells, 4);
  assert.equal(written.natural, null);
});
