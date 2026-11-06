import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture, git, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const STACK = fileURLToPath(new URL('../skills/ship/scripts/stack.mjs', import.meta.url));
const OPEN_LIST = 'pr list --state open --json number,url,headRefName,baseRefName,body';

const GH_STAND_IN = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "const argv = process.argv.slice(2).join(' ');",
  "fs.appendFileSync(process.env.STAND_IN_LOG, argv + '\\n');",
  "const bodyFile = argv.match(/--body-file (\\S+)/)?.[1];",
  "if (bodyFile) fs.appendFileSync(process.env.STAND_IN_LOG + '.bodies', fs.readFileSync(bodyFile, 'utf8') + '\\u0000');",
  "const scenario = JSON.parse(fs.readFileSync(process.env.STAND_IN_SCENARIO, 'utf8'));",
  "const reply = scenario[argv.replace(/--body-file \\S+/, '--body-file BODY')];",
  "if (!reply) { console.error(`stand-in gh: no reply for '${argv}'`); process.exit(1); }",
  'if (reply.stdout) process.stdout.write(reply.stdout);',
  'process.exit(reply.exit || 0);',
  ''
].join('\n');

const COMMITS = [
  { number: 1, dependsOn: 'none', subject: 'feat: add one', file: 'one.txt' },
  { number: 2, dependsOn: '1', subject: 'feat: add two', file: 'two.txt' },
  { number: 3, dependsOn: '2', subject: 'feat: add three', file: 'three.txt' }
];

const CREATES = {
  'pr create --base main --head feature-wave-1 --title feat: add one --body-file BODY': { stdout: 'https://github.com/acme/widgets/pull/21\n' },
  'pr create --base feature-wave-1 --head feature-wave-2 --title feat: add two --body-file BODY': { stdout: 'https://github.com/acme/widgets/pull/22\n' },
  'pr create --base feature-wave-2 --head feature --title feat: add three --body-file BODY': { stdout: 'https://github.com/acme/widgets/pull/23\n' }
};

async function stackRepository() {
  const seed = await gitRepository({ 'README.md': '# fixture\n' });
  const bareRoot = await fixture();
  const origin = path.join(bareRoot, 'origin.git');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  const cloneRoot = await fs.realpath(await fixture());
  const workDir = path.join(cloneRoot, 'work');
  execFileSync('git', ['clone', '-q', origin, workDir]);
  git(workDir, 'checkout', '-q', '-b', 'feature');
  for (const commit of COMMITS) {
    await fs.writeFile(path.join(workDir, commit.file), `${commit.file}\n`);
    git(workDir, 'add', '-A');
    git(workDir, 'commit', '-q', '-m', commit.subject, '-m', `Plan-task: ${commit.number}`);
  }
  const tasks = COMMITS.map((commit) => taskSection({
    number: commit.number,
    title: `Task ${commit.number} title`,
    dependsOn: commit.dependsOn,
    files: [`- Create: \`${commit.file}\``],
    subject: commit.subject
  }));
  const plan = path.join(cloneRoot, 'plan.md');
  const body = path.join(cloneRoot, 'body.md');
  await fs.writeFile(plan, planFixture({ tasks }));
  await fs.writeFile(body, 'Adds the stack.\n\nCloses #7\n');
  return { workDir, origin, plan, body };
}

async function ghEnv(scenario) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'gh'), GH_STAND_IN, { mode: 0o755 });
  await fs.writeFile(path.join(directory, 'scenario.json'), JSON.stringify(scenario));
  const log = path.join(directory, 'calls.log');
  return {
    log,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: log, STAND_IN_SCENARIO: path.join(directory, 'scenario.json') }
  };
}

async function callsIn(log) {
  const logged = await fs.readFile(log, 'utf8').catch(() => '');
  return logged.split('\n').filter((line) => line !== '');
}

async function stackRun(workDir, args, scenario) {
  const gh = await ghEnv(scenario);
  const outcome = await run(STACK, args, { cwd: workDir, env: gh.env });
  const bodies = await fs.readFile(`${gh.log}.bodies`, 'utf8').catch(() => '');
  return { ...outcome, calls: await callsIn(gh.log), bodies: bodies.split('\u0000').filter((body) => body !== '') };
}

async function restackDriver() {
  const driver = path.join(await fixture(), 'driver.mjs');
  const source = `import { restackChildren } from ${JSON.stringify(pathToFileURL(STACK).href)};\nrestackChildren('feature-wave-1', 'main');\n`;
  await fs.writeFile(driver, source);
  return driver;
}

async function squashedParent() {
  const repository = await stackRepository();
  const created = await stackRun(repository.workDir, ['--plan', repository.plan, '--body', repository.body], CREATES);
  assert.equal(created.code, 0, created.stderr);
  git(repository.workDir, 'checkout', '-q', 'main');
  await fs.writeFile(path.join(repository.workDir, 'one.txt'), 'one.txt\n');
  git(repository.workDir, 'add', '-A');
  git(repository.workDir, 'commit', '-q', '-m', 'feat: add one (#21)');
  git(repository.workDir, 'push', '-q', 'origin', 'main');
  git(repository.workDir, 'checkout', '-q', 'feature');
  return repository;
}

function openPullRequest({ number, head, base, parent }) {
  return { number, url: `https://github.com/acme/widgets/pull/${number}`, headRefName: head, baseRefName: base, body: `Task.\n\nStack-parent: ${parent}\n` };
}

const WAVE_2 = { number: 22, head: 'feature-wave-2', base: 'feature-wave-1', parent: 'feature-wave-1' };
const WAVE_3 = { number: 23, head: 'feature', base: 'feature-wave-2', parent: 'feature-wave-2' };

function remoteHead(origin, branch) {
  return execFileSync('git', ['--git-dir', origin, 'rev-parse', branch], { encoding: 'utf8' }).trim();
}

function assertFastForward(origin, before, after) {
  execFileSync('git', ['--git-dir', origin, 'merge-base', '--is-ancestor', before, after]);
  execFileSync('git', ['--git-dir', origin, 'merge-base', '--is-ancestor', 'main', after]);
}

test('--plan opens one pull request per wave, each based on the wave before', async () => {
  const { workDir, origin, plan, body } = await stackRepository();
  const outcome = await stackRun(workDir, ['--plan', plan, '--body', body], CREATES);
  assert.equal(outcome.code, 0, outcome.stderr);
  const creates = outcome.calls.filter((call) => call.startsWith('pr create'));
  assert.equal(creates.length, 3);
  assert.match(creates[0], /--base main --head feature-wave-1 /);
  assert.match(creates[1], /--base feature-wave-1 --head feature-wave-2 /);
  assert.match(creates[2], /--base feature-wave-2 --head feature /);
  assert.equal(remoteHead(origin, 'feature-wave-1'), git(workDir, 'rev-parse', 'HEAD~2'));
  assert.equal(remoteHead(origin, 'feature'), git(workDir, 'rev-parse', 'HEAD'));
  assert.doesNotMatch(outcome.bodies[0], /Stack-parent/);
  assert.match(outcome.bodies[1], /Stack-parent: feature-wave-1/);
  assert.match(outcome.bodies[2], /Closes #7/);
  assert.match(outcome.bodies[2], /Stack-parent: feature-wave-2/);
  assert.match(outcome.stdout, /pull\/22 open base feature-wave-1/);
});

test('restackChildren after a squash merge fast-forwards the child and retargets it to main', async () => {
  const { workDir, origin } = await squashedParent();
  const before = remoteHead(origin, 'feature-wave-2');
  const gh = await ghEnv({
    [OPEN_LIST]: { stdout: `${JSON.stringify([openPullRequest(WAVE_2)])}\n` },
    'pr edit 22 --base main': { stdout: '' }
  });
  const outcome = await run(await restackDriver(), [], { cwd: workDir, env: gh.env });
  assert.equal(outcome.code, 0, outcome.stderr);
  const calls = await callsIn(gh.log);
  assert.ok(calls.includes('pr edit 22 --base main'), calls.join('\n'));
  assertFastForward(origin, before, remoteHead(origin, 'feature-wave-2'));
});

test('restackChildren with no child pull request does nothing', async () => {
  const { workDir, origin } = await squashedParent();
  const before = remoteHead(origin, 'feature-wave-2');
  const gh = await ghEnv({ [OPEN_LIST]: { stdout: '[]\n' } });
  const outcome = await run(await restackDriver(), [], { cwd: workDir, env: gh.env });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.deepEqual(await callsIn(gh.log), [OPEN_LIST]);
  assert.equal(remoteHead(origin, 'feature-wave-2'), before);
});

test('--restack syncs only the children of a merged parent', async () => {
  const { workDir, origin } = await squashedParent();
  const before = remoteHead(origin, 'feature-wave-2');
  const open = [openPullRequest(WAVE_2), openPullRequest(WAVE_3)];
  const outcome = await stackRun(workDir, ['--restack'], {
    [OPEN_LIST]: { stdout: `${JSON.stringify(open)}\n` },
    'pr list --state merged --head feature-wave-1 --json number': { stdout: '[{"number":21}]\n' },
    'pr list --state merged --head feature-wave-2 --json number': { stdout: '[]\n' },
    'pr edit 22 --base main': { stdout: '' }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.ok(outcome.calls.includes('pr edit 22 --base main'), outcome.calls.join('\n'));
  assert.equal(outcome.calls.some((call) => call.startsWith('pr edit 23')), false);
  assertFastForward(origin, before, remoteHead(origin, 'feature-wave-2'));
});

test('the ship setting lists stack in the docs and the configure schema, in the same order', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const schema = JSON.parse(await fs.readFile(path.join(root, 'skills/configure/schema.json'), 'utf8'));
  const docs = await fs.readFile(path.join(root, 'docs/settings.md'), 'utf8');
  const row = docs.split('\n').find((line) => line.startsWith('| `ship` |'));
  const documented = [...row.split('|')[2].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  assert.ok(schema.ship.options.includes('stack'));
  assert.deepEqual(documented, schema.ship.options);
  assert.ok(schema.ship.choices.stack.label);
});
