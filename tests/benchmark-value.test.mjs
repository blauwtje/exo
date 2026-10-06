// Every value task's check.mjs fails on seed, setup and hidden, and passes
// once solution/ is laid over them, scored through the code a cell runs after
// its session. A temporary task proves the mechanism while
// benchmarks/value/ holds no task.

import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';
import { EXO_SETTINGS, GIT_IDENTITY, loadValueTasks, prepareValueRepo, projectCost, scoreValueRepo } from '../benchmarks/value.mjs';

const SCHEMA = JSON.parse(await fs.readFile(new URL('../skills/configure/schema.json', import.meta.url), 'utf8'));
const SCORE = fileURLToPath(new URL('../benchmarks/score.mjs', import.meta.url));

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...GIT_IDENTITY, ...args], { encoding: 'utf8' });
}

// Seed, settings and setup.mjs as a cell gets them, then each variant laid over.
async function scoredRepo(task, variants) {
  const repo = await fixture();
  const startTree = prepareValueRepo(task, repo);
  for (const variant of variants) await fs.cp(path.join(task.directory, variant), repo, { recursive: true });
  return { repo, verdict: await scoreValueRepo(task, repo, startTree) };
}

async function selfTest(task) {
  const seeded = await scoredRepo(task, []);
  assert.equal(seeded.verdict.pass, false, `seed should fail: ${JSON.stringify(seeded.verdict)}`);
  const solved = await scoredRepo(task, ['solution']);
  assert.equal(solved.verdict.pass, true, `solution should pass: ${JSON.stringify(solved.verdict)}`);
  return { seeded, solved };
}

for (const task of loadValueTasks()) {
  test(`${task.id}: seed with hidden fails and seed with solution and hidden passes`, async () => {
    await selfTest(task);
  });
}

const SUM_CHECK = `import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.argv[2];
const cases = JSON.parse(fs.readFileSync(path.join(repo, 'cases.json'), 'utf8'));
const { sum } = await import(pathToFileURL(path.join(repo, 'sum.mjs')).href);
const detail = cases.filter(([a, b, want]) => sum(a, b) !== want).map(([a, b, want]) => \`sum(\${a}, \${b}) is not \${want}\`);
console.log(JSON.stringify({ pass: detail.length === 0, defects: detail.length, total: cases.length, detail }));
`;

async function temporaryTask(files) {
  const root = await fixture();
  const directory = path.join(root, 'sum');
  const contents = {
    'task.json': JSON.stringify({ id: 'value-sum', claim: 'demo', timeoutMinutes: 1 }),
    'prompt.md': 'Make sum add.\n',
    'seed/sum.mjs': 'export function sum(a, b) {\n  return 0;\n}\n',
    'setup.mjs': "import fs from 'node:fs';\nfs.writeFileSync(`${process.argv[2]}/notes.js`, 'const a = 1;\\nconst b = 2;\\n');\n",
    'hidden/cases.json': '[[1, 2, 3], [2, 2, 4]]',
    'solution/sum.mjs': 'export function sum(a, b) {\n  return a + b;\n}\n',
    'check.mjs': SUM_CHECK,
    ...files
  };
  for (const [name, text] of Object.entries(contents)) {
    await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await fs.writeFile(path.join(directory, name), text);
  }
  const [task] = loadValueTasks(root);
  return task;
}

test('a temporary task: seed fails, solution passes, LOC counts only what changed after setup', async () => {
  const task = await temporaryTask({});
  assert.equal(task.id, 'value-sum');
  assert.equal(task.prompt, 'Make sum add.');
  const { seeded, solved } = await selfTest(task);
  assert.deepEqual(seeded.verdict, { loc: seeded.verdict.loc, pass: false, defects: 2, total: 2, detail: ['sum(1, 2) is not 3', 'sum(2, 2) is not 4'] });
  assert.equal(seeded.verdict.loc.added, 0, 'files setup.mjs wrote are starting state');
  assert.deepEqual([solved.verdict.loc.added, solved.verdict.loc.removed], [1, 1]);
});

test('LOC counts committed and uncommitted work and never the exo settings', async () => {
  const task = await temporaryTask({});
  const repo = await fixture();
  const startTree = prepareValueRepo(task, repo);
  assert.equal(git(repo, ['status', '--porcelain', '--', '.claude']), '', 'the settings file stays out of git');
  await fs.cp(path.join(task.directory, 'solution'), repo, { recursive: true });
  git(repo, ['commit', '-qam', 'solve']);
  await fs.writeFile(path.join(repo, 'extra.mjs'), 'export const extra = 1;\n');
  await fs.mkdir(path.join(repo, '.exo'));
  await fs.writeFile(path.join(repo, '.exo', 'scratch.js'), 'const scratch = 1;\n');
  const verdict = await scoreValueRepo(task, repo, startTree);
  assert.deepEqual(verdict.loc.files.sort(), ['extra.mjs', 'sum.mjs']);
  assert.equal(verdict.loc.added, 2);
  assert.equal(verdict.pass, true);
});

test('a check.mjs that crashes or prints no JSON line is a harness error, not a fail', async () => {
  for (const check of ['throw new Error("boom");\n', 'console.log("all good");\n']) {
    const task = await temporaryTask({ 'check.mjs': check });
    const { verdict } = await scoredRepo(task, ['solution']);
    assert.equal(verdict.pass, undefined);
    assert.match(verdict.harnessError, /check\.mjs/);
  }
});

test('exo settings take values the configure schema offers, so exo never asks', () => {
  assert.deepEqual(EXO_SETTINGS, { workspace: 'current', ship: 'local' });
  for (const [key, value] of Object.entries(EXO_SETTINGS)) assert.ok(SCHEMA[key].options.includes(value), `${key}: ${value}`);
});

test('a cell costs its past mean, else estimateUsd, else $1.50', async () => {
  const runs = await fixture();
  for (const [run, cost] of [['1', 1], ['2', 3]]) {
    const cell = path.join(runs, 'day', 'value-a', 'exo', run);
    await fs.mkdir(cell, { recursive: true });
    await fs.writeFile(path.join(cell, 'checks.json'), JSON.stringify({ task: 'value-a', arm: 'exo', model: 'm' }));
    await fs.writeFile(path.join(cell, 'result.json'), JSON.stringify({ total_cost_usd: cost }));
  }
  const cells = [
    { task: { id: 'value-a', estimateUsd: 9 }, arm: 'exo', modelId: 'm' },
    { task: { id: 'value-a', estimateUsd: 0.5 }, arm: 'baseline', modelId: 'm' },
    { task: { id: 'value-b' }, arm: 'exo', modelId: 'm' }
  ];
  assert.deepEqual(projectCost(cells, runs), { total: 4, fromRuns: 1, fromTask: 1, fromDefault: 1 });
});

test('score.mjs prints a value run as one row per task and arm with standard errors', async () => {
  const runs = await fixture();
  await fs.writeFile(path.join(runs, 'meta.json'), JSON.stringify({ model: 'm', claudeVersion: 'v', date: 'd', arms: ['exo'], runs: 2 }));
  const cells = [
    { pass: true, defects: 0, loc: 10, cost: 1 },
    { pass: false, defects: 2, loc: 20, cost: 3 },
    { harnessError: 'check.mjs exited 1: boom' }
  ];
  for (const [index, cell] of cells.entries()) {
    const directory = path.join(runs, 'value-a', 'exo', String(index + 1));
    await fs.mkdir(directory, { recursive: true });
    const { loc = 0, cost = 9, ...verdict } = cell;
    await fs.writeFile(path.join(directory, 'checks.json'), JSON.stringify({ tier: 'value', wallMs: 60000, loc: { added: loc }, ...verdict }));
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify({ total_cost_usd: cost }));
    await fs.writeFile(path.join(directory, 'usage.json'), JSON.stringify({ counts: { weightedInput: 1000, output: 0 } }));
  }
  const output = await new Promise((resolve, reject) => {
    execFile(process.execPath, [SCORE, runs], { timeout: 30_000 }, (error, stdout, stderr) => (error ? reject(new Error(stderr)) : resolve(stdout)));
  });
  assert.match(output, /\| value-a \| exo \| 2 \| 1 \| 50% ±50% \| 1\.0 ±1\.0 \| 15 ±5 \| 1\.0k ±0 \| \$2\.00 ±\$1\.00 \| 1\.0m ±0\.0m \|/);
});
