// exo run lands itself and exo approve resumes a parked run, against run-plan's
// fixture repository, its stub claude and stub osascript and gh on PATH.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, run } from './harness.mjs';
import { STUB, setup } from './run-plan-fixture.mjs';

const CLI = fileURLToPath(new URL('../skills/build/scripts/exo-cli.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));

/** A run context: every session first writes a clean branch review; with `park`, session 0 parks the run on a gate; `options` go to the plan fixture. */
async function context({ park = false, ...options } = {}) {
  const c = await setup(options);
  const root = await fs.realpath(c.root);
  await fs.writeFile(path.join(c.tools, 'session.mjs'), STUB);
  await fs.writeFile(c.stub, `
import fs from 'node:fs';
import path from 'node:path';
const record = process.env.STUB_RECORD;
const index = fs.existsSync(record) ? fs.readFileSync(record, 'utf8').split('\\n').filter(Boolean).length : 0;
fs.mkdirSync('.exo', { recursive: true });
fs.writeFileSync('.exo/branch-review.md', 'CLEAN\\n\\nCount: defect=0 concern=0 question=0 fix=0\\n');
if (${park} && index === 0) {
  fs.writeFileSync(path.join(process.env.EXO_RUN_DIR, 'parked'), 'Task 1: PARKED git push --force\\n');
  fs.appendFileSync(path.join(process.env.EXO_RUN_DIR, 'gates.md'), '- open: task 1: git push --force (denied)\\n');
}
await import('./session.mjs');
`);
  const land = (file, number) => ({ commits: [{ file, trailers: [`Plan-task: plan/${number}`] }] });
  const steps = [land('a.txt', 1), land('b.txt', 2), { result: 'Verify done.' }];
  if (park) steps.unshift({ result: 'Task 1: BLOCKED parked' });
  const scenario = path.join(c.tools, 'scenario.json');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: c.plan, steps }));
  const bin = await fixture();
  const notes = path.join(bin, 'notes.log');
  await fs.writeFile(path.join(bin, 'osascript'), `#!/bin/sh\necho "$@" >> ${notes}\n`, { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'gh'), '#!/bin/sh\necho https://example.test/pr/1\n', { mode: 0o755 });
  const env = { HOME: c.home, STUB_SCENARIO: scenario, STUB_RECORD: path.join(c.tools, 'calls.jsonl'), PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const exo = (args) => run(CLI, args, { cwd: root, env });
  const notified = async () => (await fs.readFile(notes, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  return { ...c, root, exo, notified };
}

const runDirOf = async (root) => {
  for (const where of ['run', 'kept']) {
    const names = await fs.readdir(path.join(root, '.exo', where)).catch(() => []);
    const [id] = names.filter((name) => name !== 'lock' && name !== 'live.log');
    if (id !== undefined) return { id, dir: path.join(root, '.exo', where, id) };
  }
  throw new Error(`no run under ${root}/.exo`);
};

const readRun = async (root) => {
  const { dir } = await runDirOf(root);
  return JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8'));
};

test('a passing run with Land: local lands itself, reports and notifies once', async () => {
  const c = await context();
  const result = await c.exo(['run', c.plan, '--claude', c.stub]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^Next: exo run lands branch feat\/run per Land: local; 1 manual check are listed in the detail file$/m);
  assert.doesNotMatch(result.stdout, /push it or open a pull request/);
  const { id, dir } = await runDirOf(c.root);
  assert.equal(dir, path.join(c.root, '.exo', 'kept', id));
  await assert.rejects(fs.access(path.join(c.root, '.exo', 'run', id)));
  const state = await readRun(c.root);
  assert.equal(state.phase, 'landed');
  assert.equal(state.stage, 'landing');
  assert.equal(git(c.root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  await fs.access(path.join(c.root, 'a.txt'));
  await fs.access(path.join(c.root, 'b.txt'));
  const report = (await fs.readFile(path.join(dir, 'report.md'), 'utf8')).split('\n');
  assert.ok(report.length <= 16);
  assert.ok(report.includes('Phase: landed'), report.join('\n'));
  assert.ok(report.includes('Land: local'));
  assert.ok(report.some((line) => /^Landed: [0-9a-f]{7}\.\.[0-9a-f]{7}$/.test(line)), report.join('\n'));
  const notes = await c.notified();
  assert.equal(notes.length, 1, notes.join('\n'));
  assert.match(notes[0], /landed/);

  const again = await c.exo(['run', '--resume', id]);
  assert.equal(again.code, 2);
  assert.match(again.stderr, /no run/);
});

test('report.md lists the refused commands', async () => {
  const c = await context();
  const scenario = JSON.parse(await fs.readFile(path.join(c.tools, 'scenario.json'), 'utf8'));
  scenario.steps[0].denials = [{ tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'npm install left-pad' } }];
  await fs.writeFile(path.join(c.tools, 'scenario.json'), JSON.stringify(scenario));
  const result = await c.exo(['run', c.plan, '--claude', c.stub]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const { dir } = await runDirOf(c.root);
  const report = await fs.readFile(path.join(dir, 'report.md'), 'utf8');
  assert.match(report, /^  iteration 1, task 1: npm install left-pad$/m, report);
});

test('a passing run of an old plan with no Land: line ends at passed with the push-or-PR advice and lands nothing', async () => {
  const c = await context({ land: null });
  assert.doesNotMatch(await fs.readFile(c.plan, 'utf8'), /^Land:/m);
  const result = await c.exo(['run', c.plan, '--claude', c.stub]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^Next: review branch feat\/run, then push it or open a pull request/m);
  const { id, dir } = await runDirOf(c.root);
  assert.equal(dir, path.join(c.root, '.exo', 'kept', id));
  const state = await readRun(c.root);
  assert.equal(state.phase, 'passed');
  assert.equal(state.stage, 'build');
  assert.equal(git(c.root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat/run');
  assert.ok(!git(c.root, 'ls-tree', '--name-only', 'main').split('\n').includes('a.txt'));
  const report = (await fs.readFile(path.join(dir, 'report.md'), 'utf8')).split('\n');
  assert.ok(report.includes('Phase: passed'), report.join('\n'));
  assert.ok(report.includes('Land: none'));
  assert.ok(report.includes('Landed: none'));
  const notes = await c.notified();
  assert.equal(notes.length, 1, notes.join('\n'));
  assert.match(notes[0], /passed/);
});

test('a session gate parks the run; exo approve lands it', async () => {
  const c = await context({ park: true });
  const result = await c.exo(['run', c.plan, '--claude', c.stub]);
  assert.equal(result.code, 3, result.stdout + result.stderr);
  const { id, dir } = await runDirOf(c.root);
  assert.equal(dir, path.join(c.root, '.exo', 'run', id));
  const state = await readRun(c.root);
  assert.equal(state.phase, 'parked');
  assert.equal(state.stage, 'build');
  assert.match(await fs.readFile(path.join(dir, 'report.md'), 'utf8'), /Phase: parked[\s\S]*Open gates: 1[\s\S]*task 1: git push --force/);
  assert.equal((await c.notified()).length, 1);

  const status = await c.exo(['status', id]);
  assert.match(status.stdout, /parked.*exo approve/);
  assert.match(status.stdout, /open gate: task 1: git push --force \(denied\)/);

  const refused = await c.exo(['run', '--resume', id]);
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /use exo approve/);

  const approved = await c.exo(['approve', id]);
  assert.equal(approved.code, 0, approved.stdout + approved.stderr);
  assert.match(approved.stdout, /approved 1 gate\(s\)/);
  assert.equal((await readRun(c.root)).phase, 'landed');
  const kept = path.join(c.root, '.exo', 'kept', id);
  await assert.rejects(fs.access(dir));
  assert.match(await fs.readFile(path.join(kept, 'gates.md'), 'utf8'), /^- approved: task 1: git push --force/m);
  assert.equal((await c.notified()).length, 2);
  await fs.access(path.join(c.root, 'b.txt'));
});

test('exo approve refuses a run that is not parked', async () => {
  const c = await context();
  assert.equal((await c.exo(['run', c.plan, '--claude', c.stub])).code, 0);
  const { id } = await runDirOf(c.root);
  const result = await c.exo(['approve', id]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /no run/);
  assert.equal((await c.exo(['approve', 'nope'])).code, 2);
});
