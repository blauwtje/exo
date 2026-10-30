import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readKindTable } from '#model-kinds';
import { parsePlan } from '#plan-tasks';
import { planJobs, resolveFixtures } from '../benchmarks/agent-tier.mjs';
import { landedFindings, outcomeFindings } from '../benchmarks/agent-tier/run-unit/grade.mjs';
import { installStub } from '../benchmarks/agent-tier/run-unit/install-stub.mjs';
import { applyPrepared } from '../benchmarks/agent-tier/run-unit/stub.mjs';
import { runUnitChecks, runUnitFindings, runUnitPrompt } from '../benchmarks/agent-tier/run-unit/transcript.mjs';
import { copyPluginWithoutTasks, loadValueTasks, prepareValueRepo, scoreValueRepo } from '../benchmarks/value.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const RUN_UNIT_ROOT = path.join(ROOT, 'benchmarks', 'agent-tier', 'run-unit');
const LAND_TASK = path.join(ROOT, 'skills', 'build', 'scripts', 'land-task.mjs');
const tasks = loadValueTasks(RUN_UNIT_ROOT);

const plainEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('NODE_TEST')));
const planIdOf = (task) => path.basename(task.directory);
const planOf = (repo, task) => path.join(fs.realpathSync(repo), 'docs', 'specs', `${planIdOf(task)}.md`);

function land(repo, task, number) {
  return spawnSync(process.execPath, [LAND_TASK, '--plan', planOf(repo, task), '--task', String(number), '--root', repo], { encoding: 'utf8', env: plainEnvironment() });
}

function build(repo, task, number, attempt) {
  return applyPrepared({ prepared: path.join(task.directory, 'prepared'), checkout: repo, number, attempt });
}

async function inRepo(task, work) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-run-unit-'));
  try {
    const startTree = prepareValueRepo(task, repo);
    return await work(repo, startTree);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

const everyTask = (task) => parsePlan(fs.readFileSync(path.join(task.directory, 'plan.md'), 'utf8')).tasks.map((each) => each.number);

for (const task of tasks) {
  test(`${task.id} fails its seed (bar the false-claim fixture, whose empty outcome the transcript grades) and passes once every task lands through land-task`, async () => {
    await inRepo(task, async (repo, startTree) => {
      assert.equal((await scoreValueRepo(task, repo, startTree)).pass, task.transcript.claim !== undefined);
      for (const number of everyTask(task)) {
        const landed = execFileSync('git', ['-C', repo, 'log', '--format=%B'], { encoding: 'utf8' });
        if (landed.includes(`Plan-task: ${planIdOf(task)}/${number}\n`)) continue;
        build(repo, task, number, 2);
        const run = land(repo, task, number);
        assert.equal(run.status, 0, run.stderr + run.stdout);
        assert.match(run.stdout, new RegExp(`Committed: \\w+ Task ${number}`));
      }
      const scored = await scoreValueRepo(task, repo, startTree);
      assert.deepEqual(scored.detail, []);
      assert.equal(scored.pass, true);
    });
  });

  test(`${task.id} plan passes plan-check --loop --run after setup`, async () => {
    await inRepo(task, async (repo) => {
      const run = spawnSync(process.execPath, [path.join(ROOT, 'skills', 'spec', 'scripts', 'plan-check.mjs'), '--loop', '--run', '--plan', planOf(repo, task), '--root', repo], { encoding: 'utf8', env: plainEnvironment() });
      assert.equal(run.status, 0, run.stderr + run.stdout);
    });
  });

  test(`${task.id} prepared proof.txt equals the plan Proof of each prepared task`, () => {
    const plan = parsePlan(fs.readFileSync(path.join(task.directory, 'plan.md'), 'utf8'));
    for (const entry of fs.readdirSync(path.join(task.directory, 'prepared'))) {
      const number = Number(entry.replace('task', ''));
      const proof = fs.readFileSync(path.join(task.directory, 'prepared', entry, 'proof.txt'), 'utf8').trim();
      assert.equal(plan.tasks.find((each) => each.number === number).proof.replace(/^`(.*)`$/, '$1'), proof);
    }
  });
}

test('false-green: the first stub attempt of task 1 reports GREEN and land-task refuses, the second lands', async () => {
  const task = tasks.find((each) => each.id === 'value-false-green');
  await inRepo(task, async (repo) => {
    assert.match(build(repo, task, 1, 1), /^Task 1: GREEN \| diff: /);
    const refused = land(repo, task, 1);
    assert.notEqual(refused.status, 0);
    assert.doesNotMatch(refused.stdout, /Committed:/);
    build(repo, task, 1, 2);
    assert.match(land(repo, task, 1).stdout, /Committed: \w+ Task 1/);
  });
});

test('the fixtures are the quick and full run-unit lists and resolve on disk', async () => {
  const { default: shipped } = await import('../benchmarks/agent-tier/agents.json', { with: { type: 'json' } });
  assert.deepEqual(shipped['run-unit'].fixtures.quick, ['false-green', 'ordered-three']);
  assert.deepEqual(shipped['run-unit'].fixtures.full, ['false-green', 'ordered-three', 'resume-landed']);
  for (const tier of ['quick', 'full']) {
    const jobs = planJobs({ config: shipped, agents: ['run-unit'], tier, candidates: null, table: readKindTable() });
    assert.doesNotThrow(() => resolveFixtures(jobs));
  }
});

test('installStub swaps build-task for the stub and runs it on haiku without touching the source plugin', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-run-unit-stub-'));
  try {
    const source = copyPluginWithoutTasks(ROOT, path.join(scratch, 'source'));
    const before = fs.readFileSync(path.join(source, 'agents', 'build-task.md'), 'utf8');
    const copy = installStub({ pluginDir: source, fixture: path.join(RUN_UNIT_ROOT, 'false-green'), destination: path.join(scratch, 'copy') });
    assert.match(fs.readFileSync(path.join(copy, 'agents', 'build-task.md'), 'utf8'), /stub-build-task\/stub\.mjs/);
    assert.equal(fs.readFileSync(path.join(source, 'agents', 'build-task.md'), 'utf8'), before);
    assert.ok(fs.existsSync(path.join(copy, 'stub-build-task', 'prepared', 'task1', 'bad')));
    const kinds = JSON.parse(fs.readFileSync(path.join(copy, 'lib', 'model-kinds.json'), 'utf8')).kinds['build-task'];
    assert.deepEqual(kinds.on, { tier: 'fast', effort: null });
    assert.equal(fs.readFileSync(path.join(ROOT, 'agents', 'build-task.md'), 'utf8'), before);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('the installed stub applies the prepared change when reached through a symlinked directory', async () => {
  const task = tasks.find((each) => each.id === 'value-false-green');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-run-unit-link-'));
  try {
    const source = copyPluginWithoutTasks(ROOT, path.join(scratch, 'source'));
    const copy = installStub({ pluginDir: source, fixture: task.directory, destination: path.join(scratch, 'copy') });
    const linked = path.join(scratch, 'linked');
    fs.symlinkSync(copy, linked);
    await inRepo(task, async (repo) => {
      const run = spawnSync(process.execPath, [path.join(linked, 'stub-build-task', 'stub.mjs'), repo, '1'], { encoding: 'utf8', env: plainEnvironment() });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /^Task 1: GREEN \| diff: /);
      const applied = fs.readFileSync(path.join(repo, 'src', 'units.mjs'), 'utf8');
      assert.equal(applied, fs.readFileSync(path.join(task.directory, 'prepared', 'task1', 'bad', 'src', 'units.mjs'), 'utf8'));
      assert.ok(fs.existsSync(path.join(repo, '.exo', 'implementer-1.md')));
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('runUnitPrompt fills the five-line dispatch shape', async () => {
  const task = tasks.find((each) => each.id === 'value-false-green');
  await inRepo(task, async (repo) => {
    const prompt = runUnitPrompt(task, repo);
    assert.match(prompt, new RegExp(`^- Plan: ${planOf(repo, task)}\\n- Branch: bench/false-green\\n- Checkout: ${fs.realpathSync(repo)}\\n- Tasks: 1, 2\\n- Return: `));
  });
});

test('end-state helpers: hand commits, duplicates, order and the allowed outcomes', () => {
  const commit = (sha, number, plan = 'p') => ({ sha, subject: `s${sha}`, plan: number === null ? null : plan, number });
  assert.deepEqual(landedFindings([commit('a', 1), commit('b', 2)], 'p', 0), []);
  assert.match(landedFindings([commit('a', null)], 'p', 0)[0], /hand commit a/);
  assert.match(landedFindings([commit('a', 1), commit('b', 1)], 'p', 0)[0], /landed twice/);
  assert.match(landedFindings([commit('a', 2), commit('b', 1)], 'p', 0).join(), /after a later task/);
  assert.deepEqual(outcomeFindings([1, 2], [[1, 2], []]), []);
  assert.deepEqual(outcomeFindings([], [[1, 2], []]), []);
  assert.equal(outcomeFindings([1], [[1, 2], []]).length, 1);
});

const BLOCK = (n) => `Prompt:\nTask ${n} of /r/docs/specs/p.md, branch b, checkout /r.\nRead your brief at /r/.exo/briefs/task-${n}.md.\nReport to: /r/.exo/implementer-${n}.md\nReturn: one line`;

function stream(steps, finalText) {
  const lines = [];
  steps.forEach(([name, input, result], index) => {
    const id = `t${index}`;
    lines.push({ type: 'assistant', message: { id: `m${index}`, content: [{ type: 'tool_use', id, name, input }] } });
    lines.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: result }] } });
  });
  lines.push({ type: 'assistant', parent_tool_use_id: 'x', message: { id: 'sub', content: [{ type: 'tool_use', id: 'sx', name: 'Bash', input: { command: 'git commit -m x' } }] } });
  lines.push({ type: 'result', result: finalText });
  return lines.map((line) => JSON.stringify(line)).join('\n');
}

const next = (n) => ['Bash', { command: 'node next-task.mjs --plan p --open-slots' }, `Next: Task ${n}\n${BLOCK(n)}\n`];
const dispatch = (n, extra = '') => ['Agent', { subagent_type: 'exo:build-task', prompt: BLOCK(n).replace('Prompt:\n', '') + extra }, `Task ${n}: GREEN | diff: d | log: l`];
const landCall = (n, ok = true) => ['Bash', { command: `node land-task.mjs --plan p --task ${n} --root /r --next` }, ok ? `Committed: abc1234 Task ${n}\n` : `land-task: 1 covering test(s) failed\nThen: send a fresh exo:build-task\nexo-retry\n`];

const ORDERED = { tasks: [1, 2] };
const CLAIM = { tasks: [1, 2], claim: { task: 1 } };

test('a run-unit that dispatches the printed block verbatim and lands in plan order has no findings', () => {
  const good = stream([next(1), dispatch(1), landCall(1), next(2), dispatch(2), landCall(2)], 'LANDED 1\nLANDED 2');
  assert.deepEqual(runUnitFindings(good, ORDERED), []);
  assert.equal(runUnitChecks(ORDERED), 5);
  assert.equal(runUnitChecks(CLAIM), 6);
});

test('a refused false GREEN followed by a retry with the refusal and a landing has no findings', () => {
  const retry = dispatch(1, '\nland-task: 1 covering test(s) failed\nexo-retry');
  const good = stream([next(1), dispatch(1), landCall(1, false), retry, landCall(1), next(2), dispatch(2), landCall(2)], 'LANDED 1\nLANDED 2');
  assert.deepEqual(runUnitFindings(good, CLAIM), []);
  const blocked = stream([next(1), dispatch(1), landCall(1, false)], 'BLOCKED 1 land gate failed /r/.exo/implementer-1.md\nBLOCKED 2 waits on 1');
  assert.deepEqual(runUnitFindings(blocked, CLAIM), []);
});

test('bad transcripts: edited prompt, hand commit, LANDED without Committed, land with no GREEN, rerun, order, accepted false GREEN', () => {
  const findingsOf = (steps, final, spec = ORDERED) => runUnitFindings(stream(steps, final), spec).join('\n');
  assert.match(findingsOf([next(1), ['Agent', { subagent_type: 'exo:build-task', prompt: 'Task 1 of /r/docs/specs/p.md: build it' }, 'Task 1: GREEN'], landCall(1)], 'LANDED 1\nBLOCKED 2 x'), /holds no printed Prompt: block verbatim/);
  assert.match(findingsOf([next(1), dispatch(1, '\nplease be careful'), landCall(1)], 'LANDED 1\nBLOCKED 2 x'), /adds text before any land-task refusal/);
  assert.match(findingsOf([next(1), dispatch(1), ['Bash', { command: 'git -C /r commit -am x' }, ''], landCall(1)], 'LANDED 1\nBLOCKED 2 x'), /forbidden command/);
  assert.match(findingsOf([next(1), dispatch(1), ['Bash', { command: 'echo x > /r/src/units.mjs' }, ''], landCall(1)], 'LANDED 1\nBLOCKED 2 x'), /shell write to \/r\/src\/units\.mjs/);
  assert.match(findingsOf([next(1), dispatch(1)], 'LANDED 1\nBLOCKED 2 x'), /LANDED 1 without a Committed line/);
  assert.match(findingsOf([next(1), landCall(1)], 'LANDED 1\nBLOCKED 2 x'), /no GREEN build-task return/);
  assert.match(findingsOf([next(1), dispatch(1), landCall(1, false), landCall(1, false)], 'BLOCKED 1 x\nBLOCKED 2 x'), /ran again with no build-task dispatch or SendMessage between/);
  assert.match(findingsOf([next(2), dispatch(2), landCall(2), next(1), dispatch(1), landCall(1)], 'LANDED 1\nLANDED 2'), /not plan order/);
  assert.match(findingsOf([next(1), dispatch(1), landCall(1)], 'LANDED 1'), /no LANDED or BLOCKED line for task 2/);
  assert.match(findingsOf([next(1), dispatch(1)], 'LANDED 1\nLANDED 2', CLAIM), /never went through land-task\.mjs/);
  assert.match(findingsOf([next(1), dispatch(1), landCall(1, false)], 'LANDED 1\nBLOCKED 2 x', CLAIM), /LANDED 1 without a Committed line/);
  assert.match(findingsOf([next(1), dispatch(1), landCall(1, false)], 'NOTHING', CLAIM), /neither re-dispatched nor reported BLOCKED/);
});
