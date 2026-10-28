import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync as writeSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { compactPlanFixture, git, gitRepository, run } from './harness.mjs';
import { compactTask, editApp, SCRIPT, writeReport } from './land-task-fixture.mjs';
import { EnvError, LandingError, landTask } from '../skills/build/scripts/land-task.mjs';

const PROOF = 'node tests/gate.test.mjs';
const GATE_TEST = [
  "import fs from 'node:fs';",
  "fs.appendFileSync('.exo/runs.log', 'run\\n');",
  "if (!fs.existsSync('.exo/service-up')) process.exit(1);",
  "console.log('# pass 1');",
  ''
].join('\n');
const PLAN = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: PROOF })] });
const REPORT = ['Landed: src/app.js', 'Proof:', `- \`${PROOF}\`: pass`, '  # pass 1', 'Unresolved: none', ''].join('\n');

async function checkout() {
  const root = await gitRepository({
    'src/app.js': 'export function greet() {}\n',
    'docs/plans/compact.md': PLAN,
    'package.json': '{ "type": "module" }\n',
    'compose.yaml': 'services: {}\n',
    'tests/gate.test.mjs': GATE_TEST
  });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await fs.appendFile(path.join(root, '.git/info/exclude'), '.exo/\n');
  await editApp(root);
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await writeReport(root, REPORT);
  return { root, planPath: path.join(root, 'docs/plans/compact.md') };
}

function fakeDocker(root, { starts = true, alreadyUp = false, needed = true } = {}) {
  let clock = 0;
  const flag = path.join(root, '.exo/service-up');
  const calls = { start: 0 };
  return {
    calls,
    needed: () => needed,
    probe: () => alreadyUp || existsSync(flag),
    start: () => {
      calls.start += 1;
      if (starts) writeSync(flag, 'up');
      return starts;
    },
    sleep: (ms) => { clock += ms; },
    now: () => clock
  };
}

const land = (setup, docker) => landTask({ planPath: setup.planPath, planText: PLAN, number: 1, root: setup.root, reportText: REPORT, docker });
const proofRuns = async (root) => (await fs.readFile(path.join(root, '.exo/runs.log'), 'utf8')).trim().split('\n').length;

test('a red Proof with Docker down and startable lands after one rerun', async () => {
  const setup = await checkout();
  const docker = fakeDocker(setup.root);
  assert.match(land(setup, docker), /^Committed: [0-9a-f]+ Task 1$/m);
  assert.equal(docker.calls.start, 1);
  assert.equal(await proofRuns(setup.root), 2);
});

test('a red Proof with Docker unstartable is refused as ENV with no rerun', async () => {
  const setup = await checkout();
  const docker = fakeDocker(setup.root, { starts: false });
  assert.throws(() => land(setup, docker), (error) => {
    assert.ok(error instanceof EnvError);
    assert.match(error.message, /^ENV: docker down/);
    return true;
  });
  assert.equal(await proofRuns(setup.root), 1);
});

test('a red Proof with Docker already up fails once with no rerun', async () => {
  const setup = await checkout();
  const docker = fakeDocker(setup.root, { alreadyUp: true });
  assert.throws(() => land(setup, docker), (error) => error instanceof LandingError && !(error instanceof EnvError) && /failed \(exit 1\)/.test(error.message));
  assert.equal(docker.calls.start, 0);
  assert.equal(await proofRuns(setup.root), 1);
});

test('a red Proof in a project that needs no services fails as before', async () => {
  const setup = await checkout();
  const docker = fakeDocker(setup.root, { needed: false });
  assert.throws(() => land(setup, docker), (error) => error instanceof LandingError && !(error instanceof EnvError));
  assert.equal(docker.calls.start, 0);
});

test('the command line prints the ENV refusal with no exo-retry line', async () => {
  const setup = await checkout();
  const bin = await fs.mkdtemp(path.join(os.tmpdir(), 'bin-'));
  await fs.symlink(process.execPath, path.join(bin, 'node'));
  await fs.symlink(execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), path.join(bin, 'git'));
  const result = await run(SCRIPT, ['--plan', setup.planPath, '--task', '1', '--root', setup.root], { cwd: setup.root, env: { PATH: bin } });
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /land-task: ENV: docker down/);
  assert.doesNotMatch(result.stderr, /exo-retry/);
});

test('--help prints the usage and exits 0', async () => {
  const help = await run(SCRIPT, ['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^usage: land-task\.mjs --plan <plan> --task <n>/);
  assert.match(help.stdout, /--check/);
  assert.match(help.stdout, /--fix/);
});
