// install.mjs selects harnesses, scope and projects from flags, prompts or
// defaults, prints one plan, and calls each selected adapter through the
// adapter contract. A stub adapter registered through harnesses/registry.mjs
// stands in for the real harnesses.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { after, afterEach, beforeEach, test } from 'node:test';
import { run } from '../install.mjs';
import { adapters } from '../harnesses/registry.mjs';

const REPO = new URL('../', import.meta.url).pathname;
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-')));
after(() => fs.rmSync(base, { recursive: true, force: true }));

const calls = [];

// `state` is what detect() answers for the stub; `fail` makes install throw.
function stub(name, label, state = { detected: true, installable: true }, fail = false) {
  return {
    name,
    label,
    detect: () => state,
    install: (plan) => {
      calls.push(['install', name, plan.scope, plan.project]);
      if (fail) throw new Error(`${name} exploded`);
      return `installed ${name}`;
    },
    update: (record) => {
      calls.push(['update', name, record.scope, record.project]);
      return { summary: `updated ${name}`, notes: ['kept a file'] };
    },
    remove: (record) => {
      calls.push(['remove', name, record.scope, record.project]);
      return `removed ${name}`;
    }
  };
}

let saved;
beforeEach(() => {
  calls.length = 0;
  saved = adapters.splice(0);
});
afterEach(() => adapters.splice(0, adapters.length, ...saved));

function register(...list) {
  adapters.push(...list);
}

function sink() {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  return { stream, text: () => Buffer.concat(chunks).toString() };
}

// Runs install.mjs in this process with a registered adapter list; `answers`
// make the input a terminal that types those lines.
async function exo(args, { answers, cwd = base, root = REPO } = {}) {
  const out = sink();
  const err = sink();
  const input = new PassThrough();
  if (answers !== undefined) input.end(answers.map((line) => `${line}\n`).join(''));
  else input.end();
  let code;
  let thrown;
  try {
    code = await run(args, { cwd, root, env: {}, input, stdout: out.stream, stderr: err.stream, interactive: answers !== undefined });
  } catch (error) {
    thrown = error.message;
  }
  return { code, thrown, out: out.text(), err: err.text() };
}

function folder(name) {
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('the shipped registry is a list of adapters', () => {
  assert.ok(Array.isArray(saved));
});

test('--yes installs every installable harness at user scope and prints the plan', async () => {
  register(stub('one', 'First'), stub('two', 'Second'));
  const result = await exo(['--yes']);
  assert.equal(result.code, 0);
  assert.deepEqual(calls, [['install', 'one', 'user', undefined], ['install', 'two', 'user', undefined]]);
  assert.match(result.out, /exo install plan/);
  assert.match(result.out, /First: user/);
  assert.match(result.out, /First: installed one/);
});

test('without a terminal the installer behaves as --yes', async () => {
  register(stub('one', 'First'));
  const result = await exo([]);
  assert.equal(result.code, 0);
  assert.deepEqual(calls, [['install', 'one', 'user', undefined]]);
});

test('a harness that is absent is skipped and one that is blocked is listed with its reason', async () => {
  register(
    stub('here', 'Here'),
    stub('absent', 'Absent', { detected: false, installable: false }),
    stub('blocked', 'Blocked', { detected: true, installable: false, reason: 'its CLI is missing' })
  );
  const result = await exo(['--yes']);
  assert.deepEqual(calls, [['install', 'here', 'user', undefined]]);
  assert.match(result.out, /Blocked: not installable \(its CLI is missing\)/);
  assert.doesNotMatch(result.out, /Absent/);
});

test('--harness picks adapters by name and refuses an unknown or a blocked one before any write', async () => {
  register(stub('one', 'First'), stub('two', 'Second'), stub('blocked', 'Blocked', { detected: true, installable: false, reason: 'its CLI is missing' }));
  const picked = await exo(['--harness', 'two']);
  assert.equal(picked.code, 0);
  assert.deepEqual(calls, [['install', 'two', 'user', undefined]]);

  calls.length = 0;
  assert.match((await exo(['--harness', 'one,nope'])).thrown, /unknown harness nope; known: one, two, blocked/);
  assert.match((await exo(['--harness', 'one,blocked'])).thrown, /Blocked is not installable: its CLI is missing/);
  assert.deepEqual(calls, []);
});

test('no installable harness is an error naming why', async () => {
  register(stub('blocked', 'Blocked', { detected: true, installable: false, reason: 'its CLI is missing' }));
  assert.match((await exo(['--yes'])).thrown, /no harness to install into \(Blocked: its CLI is missing\)/);
  assert.deepEqual(calls, []);
});

test('a per-project scope defaults to the current folder', async () => {
  register(stub('one', 'First'));
  const cwd = folder('current');
  const result = await exo(['--yes', '--scope', 'project'], { cwd });
  assert.equal(result.code, 0);
  assert.deepEqual(calls, [['install', 'one', 'project', cwd]]);
  assert.match(result.out, new RegExp(`First: project in ${cwd}`));
});

test('--project repeats and installs each folder, relative ones against the current folder', async () => {
  register(stub('one', 'First'));
  const cwd = folder('current');
  const other = folder('other');
  folder('current/sub');
  const result = await exo(['--scope', 'local', '--project', 'sub', '--project', other], { cwd });
  assert.equal(result.code, 0);
  assert.deepEqual(calls, [['install', 'one', 'local', path.join(cwd, 'sub')], ['install', 'one', 'local', other]]);
});

test('a project folder that is not a folder aborts before any write', async () => {
  register(stub('one', 'First'));
  const result = await exo(['--scope', 'project', '--project', path.join(base, 'missing')]);
  assert.match(result.thrown, /is not a folder/);
  assert.deepEqual(calls, []);
});

test('--project needs a per-project scope', async () => {
  register(stub('one', 'First'));
  assert.match((await exo(['--project', base])).thrown, /--project needs --scope project or local/);
  assert.match((await exo(['--scope', 'user', '--project', base])).thrown, /does not apply to --scope user/);
  assert.match((await exo(['--scope', 'world'])).thrown, /--scope must be one of user, project, local/);
  assert.deepEqual(calls, []);
});

test('Enter at every prompt installs every detected harness at user scope', async () => {
  register(stub('one', 'First'), stub('two', 'Second'));
  const result = await exo([], { answers: ['', ''] });
  assert.equal(result.code, 0);
  assert.deepEqual(calls, [['install', 'one', 'user', undefined], ['install', 'two', 'user', undefined]]);
  assert.match(result.out, /Harnesses \[one,two\]: /);
  assert.match(result.out, /Scope user\|project\|local \[user\]: /);
});

test('prompts take harnesses, scope and comma-separated project folders, and skip what a flag set', async () => {
  register(stub('one', 'First'), stub('two', 'Second'));
  const a = folder('a');
  const b = folder('b');
  const result = await exo([], { answers: ['two', 'project', `${a}, ${b}`] });
  assert.equal(result.code, 0);
  assert.deepEqual(calls, [['install', 'two', 'project', a], ['install', 'two', 'project', b]]);

  calls.length = 0;
  const flagged = await exo(['--harness', 'one', '--scope', 'local'], { answers: [''], cwd: a });
  assert.equal(flagged.code, 0);
  assert.deepEqual(calls, [['install', 'one', 'local', a]]);
  assert.doesNotMatch(flagged.out, /Harnesses \[|Scope /);
  assert.match(flagged.out, /Project folders, comma-separated/);
});

test('--yes with a terminal asks nothing', async () => {
  register(stub('one', 'First'));
  const result = await exo(['--yes'], { answers: [] });
  assert.equal(result.code, 0);
  assert.doesNotMatch(result.out, /Harnesses \[|Scope /);
});

test('an invalid scope answer aborts before any write', async () => {
  register(stub('one', 'First'));
  const result = await exo([], { answers: ['', 'galaxy'] });
  assert.match(result.thrown, /scope must be one of/);
  assert.deepEqual(calls, []);
});

test('one failed install is reported, the others still run and the exit code is 1', async () => {
  register(stub('bad', 'Bad', undefined, true), stub('good', 'Good'));
  const result = await exo(['--yes']);
  assert.equal(result.code, 1);
  assert.match(result.err, /Bad failed: bad exploded/);
  assert.match(result.out, /Good: installed good/);
});

test('--update pulls the clone first, then updates every adapter with the filter', async () => {
  register(stub('one', 'First'), stub('two', 'Second'));
  const origin = path.join(base, 'origin');
  const git = (cwd, ...args) => {
    const done = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
    assert.equal(done.status, 0, done.stderr);
    return done.stdout;
  };
  fs.mkdirSync(origin);
  git(origin, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(origin, 'a.txt'), 'one');
  git(origin, 'add', '.');
  git(origin, 'commit', '-q', '-m', 'one');
  const clone = path.join(base, 'clone');
  git(base, 'clone', '-q', origin, clone);
  fs.writeFileSync(path.join(origin, 'a.txt'), 'two');
  git(origin, 'commit', '-qam', 'two');

  const result = await exo(['--update', '--scope', 'user'], { root: clone });
  assert.equal(result.code, 0);
  assert.equal(fs.readFileSync(path.join(clone, 'a.txt'), 'utf8'), 'two');
  assert.deepEqual(calls, [['update', 'one', 'user', undefined], ['update', 'two', 'user', undefined]]);
  assert.match(result.out, /First: updated one\n    kept a file/);
});

test('--update aborts before any adapter when the pull fails', async () => {
  register(stub('one', 'First'));
  const notClone = folder('not-a-clone');
  const result = await exo(['--update'], { root: notClone });
  assert.match(result.thrown, /git pull --ff-only failed/);
  assert.deepEqual(calls, []);
});

test('--remove asks every adapter, or only the matching ones, to remove what they recorded', async () => {
  register(stub('one', 'First'), stub('two', 'Second'));
  const everything = await exo(['--remove']);
  assert.equal(everything.code, 0);
  assert.deepEqual(calls, [['remove', 'one', undefined, undefined], ['remove', 'two', undefined, undefined]]);
  assert.match(everything.out, /First: removed one/);

  calls.length = 0;
  const gone = path.join(base, 'gone-project');
  await exo(['--remove', '--harness', 'two', '--scope', 'local', '--project', gone]);
  assert.deepEqual(calls, [['remove', 'two', 'local', gone]]);
});

test('--update and --remove cannot be combined', async () => {
  register(stub('one', 'First'));
  assert.match((await exo(['--update', '--remove'])).thrown, /cannot be combined/);
});

test('node install.mjs runs as a process and exits 1 with the message on an error', () => {
  const done = spawnSync(process.execPath, [path.join(REPO, 'install.mjs'), '--yes', '--harness', 'nope'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(done.status, 1);
  assert.match(done.stderr, /unknown harness nope/);
});

test('node install.mjs runs when the path to it passes through a symlinked folder', () => {
  const link = path.join(base, 'linked-clone');
  fs.symlinkSync(REPO, link, 'dir');
  const done = spawnSync(process.execPath, [path.join(link, 'install.mjs'), '--bogus'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(done.status, 1);
  assert.match(done.stderr, /Unknown option '--bogus'/);
});

test('the shipped Codex adapter installs and removes per project through run', async () => {
  const real = saved.find((adapter) => adapter.name === 'codex');
  assert.ok(real);
  register(real);
  const home = folder('codex-home');
  const bin = folder('codex-bin');
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
  const project = folder('codex-project');
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  const env = { HOME: home, CODEX_HOME: path.join(home, '.codex'), PATH: bin };
  const out = sink();
  const err = sink();
  const options = { cwd: base, root: REPO, env, input: new PassThrough(), stdout: out.stream, stderr: err.stream, interactive: false };
  assert.equal(await run(['--harness', 'codex', '--scope', 'local', '--project', project], options), 0, err.text() + out.text());
  assert.equal(fs.existsSync(path.join(project, '.codex', 'hooks.json')), true);
  assert.match(fs.readFileSync(path.join(project, '.git', 'info', 'exclude'), 'utf8'), /^\/\.codex\/hooks\.json$/m);
  assert.equal(await run(['--harness', 'codex', '--remove', '--scope', 'local', '--project', project], options), 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, '.codex', 'hooks.json'), 'utf8')), { hooks: {} });
  assert.doesNotMatch(fs.readFileSync(path.join(project, '.git', 'info', 'exclude'), 'utf8'), /\.codex/);
  assert.equal(fs.existsSync(path.join(home, '.codex', 'exo')), false);
});
