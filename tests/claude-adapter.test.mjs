// The Claude Code adapter runs `claude plugin ...` per scope and records each
// install in `${CLAUDE_CONFIG_DIR:-~/.claude}/exo/installed.json`. A fake `claude`
// on PATH logs its working directory and arguments, so the calls are checked
// without a real Claude Code.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { adapters } from '../harnesses/registry.mjs';
import { detect, install, label, name, remove, update } from '../harnesses/claude/adapter.mjs';

const ROOT = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const MARKETPLACE = ['plugin', 'marketplace', 'add', 'blauwtje/exo'];

// FAKE_FAIL names the `claude plugin <verb>` that exits 3 with "boom" on stderr.
const FAKE = `#!/bin/sh
printf '%s|%s\\n' "$PWD" "$*" >> "$FAKE_LOG"
if [ "$2" = "$FAKE_FAIL" ]; then echo boom >&2; exit 3; fi
`;

function sandbox({ cli = true } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-adapter-')));
  const paths = {
    base,
    bin: path.join(base, 'bin'),
    config: path.join(base, 'config'),
    log: path.join(base, 'calls.log'),
    project: path.join(base, 'project'),
    other: path.join(base, 'other')
  };
  for (const folder of [paths.bin, paths.project, paths.other]) fs.mkdirSync(folder);
  if (cli) fs.writeFileSync(path.join(paths.bin, 'claude'), FAKE, { mode: 0o755 });
  paths.env = { PATH: paths.bin, HOME: base, USERPROFILE: base, CLAUDE_CONFIG_DIR: paths.config, FAKE_LOG: paths.log };
  paths.recordFile = path.join(paths.config, 'exo', 'installed.json');
  return paths;
}

const calls = (paths) => (fs.existsSync(paths.log) ? fs.readFileSync(paths.log, 'utf8').trim().split('\n') : [])
  .map((line) => line.split('|'));
const record = (paths) => JSON.parse(fs.readFileSync(paths.recordFile, 'utf8'));
const plan = (paths, extra = {}) => ({ root: ROOT, env: paths.env, scope: 'user', ...extra });
const selector = (paths, extra = {}) => ({ root: ROOT, env: paths.env, ...extra });

test('the adapter is registered and named for Claude Code', () => {
  assert.equal(name, 'claude');
  assert.equal(label, 'Claude Code');
  assert.ok(adapters.some((adapter) => adapter.name === 'claude'));
});

test('detect reads the CLI on PATH and the config folder', () => {
  const withCli = sandbox();
  assert.deepEqual(detect(withCli.env), { detected: true, installable: true });

  const folderOnly = sandbox({ cli: false });
  fs.mkdirSync(folderOnly.config);
  const blocked = detect(folderOnly.env);
  assert.equal(blocked.detected, true);
  assert.equal(blocked.installable, false);
  assert.match(blocked.reason, /claude/);

  const neither = sandbox({ cli: false });
  const absent = detect(neither.env);
  assert.equal(absent.detected, false);
  assert.equal(absent.installable, false);
});

test('a user install adds the marketplace, installs at user scope and records it', () => {
  const paths = sandbox();
  const result = install(plan(paths));
  assert.equal(typeof (result.summary ?? result), 'string');
  assert.deepEqual(calls(paths).map(([, argv]) => argv), [
    MARKETPLACE.join(' '),
    'plugin install exo@blauwtje -s user'
  ]);
  assert.deepEqual(record(paths), { version: 2, installs: [{ scope: 'user' }] });
});

test('project and local installs run in the project folder and record it', () => {
  const paths = sandbox();
  install(plan(paths, { scope: 'project', project: paths.project }));
  install(plan(paths, { scope: 'local', project: paths.project }));
  const rows = calls(paths);
  assert.deepEqual(rows.map(([cwd]) => cwd), Array(4).fill(paths.project));
  assert.deepEqual(rows.map(([, argv]) => argv).filter((argv) => argv.includes('install')), [
    'plugin install exo@blauwtje -s project',
    'plugin install exo@blauwtje -s local'
  ]);
  assert.deepEqual(record(paths).installs, [
    { scope: 'project', project: paths.project },
    { scope: 'local', project: paths.project }
  ]);
});

test('installing the same scope and project again keeps one record', () => {
  const paths = sandbox();
  install(plan(paths, { scope: 'project', project: paths.project }));
  install(plan(paths, { scope: 'project', project: paths.project }));
  assert.equal(record(paths).installs.length, 1);
});

test('a project scope without a folder, or with a missing one, writes nothing and runs nothing', () => {
  const paths = sandbox();
  assert.throws(() => install(plan(paths, { scope: 'project' })), /project/);
  assert.throws(() => install(plan(paths, { scope: 'local', project: path.join(paths.base, 'gone') })), /gone/);
  assert.deepEqual(calls(paths), []);
  assert.equal(fs.existsSync(paths.recordFile), false);
});

test('a failing CLI call aborts the install with its stderr and records nothing', () => {
  const paths = sandbox();
  paths.env.FAKE_FAIL = 'install';
  assert.throws(() => install(plan(paths)), /boom/);
  assert.equal(fs.existsSync(paths.recordFile), false);

  const marketplace = sandbox();
  marketplace.env.FAKE_FAIL = 'marketplace';
  assert.throws(() => install(plan(marketplace)), /boom/);
  assert.equal(calls(marketplace).length, 1);
});

test('an unparseable or forged record stops every verb before a CLI call', () => {
  const paths = sandbox();
  fs.mkdirSync(path.dirname(paths.recordFile), { recursive: true });
  for (const text of ['{nope', '{"version":2,"installs":[{"scope":"root"}]}', '{"version":2,"installs":[{"scope":"local"}]}', '[]']) {
    fs.writeFileSync(paths.recordFile, text);
    assert.throws(() => install(plan(paths)), /installed\.json|install record/);
    assert.throws(() => update(selector(paths)), /installed\.json|install record/);
    assert.throws(() => remove(selector(paths)), /installed\.json|install record/);
    assert.equal(fs.readFileSync(paths.recordFile, 'utf8'), text);
  }
  assert.deepEqual(calls(paths), []);
});

test('update runs the CLI update for each matching recorded install only', () => {
  const paths = sandbox();
  install(plan(paths));
  install(plan(paths, { scope: 'project', project: paths.project }));
  install(plan(paths, { scope: 'local', project: paths.other }));
  fs.rmSync(paths.log);

  update(selector(paths, { scope: 'project' }));
  assert.deepEqual(calls(paths), [[paths.project, 'plugin update exo@blauwtje -s project']]);

  fs.rmSync(paths.log);
  update(selector(paths));
  assert.deepEqual(calls(paths).map(([, argv]) => argv), [
    'plugin update exo@blauwtje -s user',
    'plugin update exo@blauwtje -s project',
    'plugin update exo@blauwtje -s local'
  ]);

  fs.rmSync(paths.log);
  update(selector(paths, { project: paths.other }));
  assert.deepEqual(calls(paths), [[paths.other, 'plugin update exo@blauwtje -s local']]);
  assert.equal(record(paths).installs.length, 3);
});

test('update with nothing recorded says so and runs nothing', () => {
  const paths = sandbox();
  const result = update(selector(paths));
  assert.match(result.summary ?? result, /nothing to update/);
  assert.deepEqual(calls(paths), []);
});

test('remove uninstalls the matching installs and drops exactly those records', () => {
  const paths = sandbox();
  install(plan(paths));
  install(plan(paths, { scope: 'project', project: paths.project }));
  install(plan(paths, { scope: 'local', project: paths.other }));
  fs.rmSync(paths.log);

  remove(selector(paths, { scope: 'project', project: paths.project }));
  assert.deepEqual(calls(paths), [[paths.project, 'plugin uninstall exo@blauwtje -s project']]);
  assert.deepEqual(record(paths).installs, [{ scope: 'user' }, { scope: 'local', project: paths.other }]);

  remove(selector(paths));
  assert.equal(fs.existsSync(paths.recordFile), false);
  assert.equal(fs.existsSync(path.dirname(paths.recordFile)), false);
});

test('a failing uninstall keeps its record and still drops the ones that worked', () => {
  const paths = sandbox();
  install(plan(paths));
  install(plan(paths, { scope: 'project', project: paths.project }));
  paths.env.FAKE_FAIL = 'uninstall';
  assert.throws(() => remove(selector(paths)), /boom/);
  assert.equal(record(paths).installs.length, 2);

  delete paths.env.FAKE_FAIL;
  remove(selector(paths, { scope: 'user' }));
  assert.deepEqual(record(paths).installs, [{ scope: 'project', project: paths.project }]);
});

test('remove with nothing recorded says so', () => {
  const paths = sandbox();
  assert.match(remove(selector(paths)).summary ?? remove(selector(paths)), /nothing to remove/);
  assert.deepEqual(calls(paths), []);
});
