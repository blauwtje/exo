// The Codex adapter, run through `install.mjs`, copies generated skills, copies
// agents and merges hook groups into Codex's user folders, records them, and
// removes exactly those. It refuses a file, folder, link or hook group it did not
// write, and an unparseable hooks.json or install record, before any write; a
// forged record cannot name a path outside the folders.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { detect, install, remove, update } from '../harnesses/codex/adapter.mjs';
import { generateTree } from '../harnesses/codex/generate.mjs';
import { codexHookEntries } from '../harnesses/codex/hooks.mjs';

const ROOT = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const INSTALL = path.join(ROOT, 'install.mjs');
const TREE = generateTree(ROOT);
const AGENT_NAMES = fs.readdirSync(path.join(ROOT, 'harnesses', 'codex', 'generated', 'agents')).filter((name) => name.endsWith('.toml'));
const SKILL_NAMES = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const SKILL = SKILL_NAMES.includes('build') ? 'build' : SKILL_NAMES[0];
const SKILL_FILE = path.join(ROOT, 'harnesses', 'codex', 'generated', 'skills', SKILL, 'SKILL.md');

function sandbox() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-adapter-')));
  const paths = {
    base,
    home: path.join(base, 'codex'),
    skills: path.join(base, '.agents', 'skills'),
    bin: path.join(base, 'bin'),
    outside: path.join(base, 'outside')
  };
  fs.mkdirSync(paths.home, { recursive: true });
  fs.mkdirSync(paths.bin);
  fs.mkdirSync(paths.outside);
  fs.writeFileSync(path.join(paths.bin, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
  paths.env = { PATH: paths.bin, HOME: paths.base, USERPROFILE: paths.base, CODEX_HOME: paths.home };
  return paths;
}

// Runs install.mjs against the sandbox, so the adapter is reached the way a user reaches it.
function runInstaller(paths, args = []) {
  return spawnSync(process.execPath, [INSTALL, '--harness', 'codex', '--yes', ...args], {
    encoding: 'utf8',
    env: { ...paths.env, PATH: `${paths.bin}${path.delimiter}${path.dirname(process.execPath)}` },
    cwd: paths.base
  });
}

const apply = (paths, call = install, extra = {}) => call({ root: ROOT, env: paths.env, scope: 'user', ...extra });
const selector = (paths, extra = {}) => ({ root: ROOT, env: paths.env, ...extra });

// Every path under `directory` with its type, link target and content hash.
function snapshot(directory) {
  const rows = [];
  const walk = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const full = path.join(current, name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) rows.push(`${full} -> ${fs.readlinkSync(full)}`);
      else if (stat.isDirectory()) {
        rows.push(`${full}/`);
        walk(full);
      } else rows.push(`${full} ${crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`);
    }
  };
  walk(directory);
  return rows;
}

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const recordPath = (paths) => path.join(paths.home, 'exo', 'installed.json');
const hooksPath = (paths) => path.join(paths.home, 'hooks.json');
const userInstall = (paths) => readJson(recordPath(paths)).installs.find((entry) => entry.scope === 'user');

test('install.mjs installs generated skills, agents and hooks into the user folders and records them', () => {
  const paths = sandbox();
  fs.writeFileSync(path.join(paths.home, 'config.toml'), 'model = "x"\n');
  const result = runInstaller(paths);
  assert.equal(result.status, 0, result.stderr);
  for (const name of SKILL_NAMES) {
    const stat = fs.lstatSync(path.join(paths.skills, name));
    assert.equal(stat.isDirectory(), true, name);
  }
  const text = fs.readFileSync(path.join(paths.skills, SKILL, 'SKILL.md'), 'utf8');
  assert.equal(text, TREE.get(path.posix.join('harnesses/codex/generated/skills', SKILL, 'SKILL.md')).replaceAll('{{EXO_ROOT}}', ROOT).replaceAll('{{SKILL_DIR}}', path.join(paths.skills, SKILL)));
  assert.doesNotMatch(text, /\{\{(EXO_ROOT|SKILL_DIR)\}\}/);
  for (const name of AGENT_NAMES) {
    const expected = TREE.get(`harnesses/codex/generated/agents/${name}`).replaceAll('{{EXO_ROOT}}', ROOT);
    assert.equal(fs.readFileSync(path.join(paths.home, 'agents', name), 'utf8'), expected);
  }
  assert.deepEqual(readJson(hooksPath(paths)), { hooks: codexHookEntries(ROOT) });
  const entry = userInstall(paths);
  assert.equal(entry.skills.length, SKILL_NAMES.length);
  assert.equal(entry.skills.find((skill) => skill.name === SKILL).files.find((file) => file.path === 'SKILL.md').sha256, hash(text));
  assert.equal(entry.agents.length, AGENT_NAMES.length);
  assert.equal(entry.hooks.length, 4);
  assert.equal(fs.readFileSync(path.join(paths.home, 'config.toml'), 'utf8'), 'model = "x"\n');
});

test('detect reads the PATH and the Codex folder', () => {
  const paths = sandbox();
  assert.deepEqual(detect(paths.env), { detected: true, installable: true });
  const noCli = { ...paths.env, PATH: paths.outside };
  assert.equal(detect(noCli).installable, false);
  assert.equal(detect(noCli).detected, true);
  assert.match(detect(noCli).reason, /not on PATH/);
  const nothing = { ...noCli, CODEX_HOME: path.join(paths.base, 'absent') };
  assert.equal(detect(nothing).detected, false);
});

test('a rerun changes nothing and keeps a foreign hook group', () => {
  const paths = sandbox();
  const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] };
  fs.writeFileSync(hooksPath(paths), JSON.stringify({ other: 1, hooks: { PreToolUse: [foreign] } }));
  apply(paths);
  const first = snapshot(paths.base);
  apply(paths);
  assert.deepEqual(snapshot(paths.base), first);
  const config = readJson(hooksPath(paths));
  assert.equal(config.other, 1);
  assert.deepEqual(config.hooks.PreToolUse[0], foreign);
  assert.equal(config.hooks.PreToolUse.length, 2);
});

test('remove deletes exactly what the record lists and keeps the rest', () => {
  const paths = sandbox();
  const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] };
  fs.writeFileSync(hooksPath(paths), JSON.stringify({ hooks: { PreToolUse: [foreign] } }));
  fs.mkdirSync(path.join(paths.home, 'agents'));
  fs.writeFileSync(path.join(paths.home, 'agents', 'mine.toml'), 'name = "mine"\n');
  fs.mkdirSync(path.join(paths.skills, 'mine'), { recursive: true });
  apply(paths);
  const result = runInstaller(paths, ['--remove']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(paths.skills), ['mine']);
  assert.deepEqual(fs.readdirSync(path.join(paths.home, 'agents')), ['mine.toml']);
  assert.deepEqual(readJson(hooksPath(paths)), { hooks: { PreToolUse: [foreign] } });
  assert.equal(fs.existsSync(path.join(paths.home, 'exo')), false);
});

test('remove with no record writes nothing', () => {
  const paths = sandbox();
  const before = snapshot(paths.base);
  const result = runInstaller(paths, ['--remove']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(paths.base), before);
});

test('remove keeps an agent file and a skill file edited after the install', () => {
  const paths = sandbox();
  apply(paths);
  const agent = path.join(paths.home, 'agents', AGENT_NAMES[0]);
  const skill = path.join(paths.skills, SKILL, 'SKILL.md');
  fs.appendFileSync(agent, '# mine\n');
  fs.appendFileSync(skill, '# mine\n');
  const result = remove(selector(paths));
  assert.equal(result.notes.length, 2);
  assert.match(result.notes[0], /kept .*it is not the file exo wrote/);
  assert.equal(fs.existsSync(agent), true);
  assert.equal(fs.existsSync(skill), true);
});

test('remove narrowed to another scope or project removes nothing', () => {
  const paths = sandbox();
  apply(paths);
  const before = snapshot(paths.base);
  assert.match(remove(selector(paths, { scope: 'project' })), /nothing to remove/);
  assert.match(remove(selector(paths, { project: path.join(paths.base, 'elsewhere') })), /nothing to remove/);
  assert.deepEqual(snapshot(paths.base), before);
});

test('project and local scope are refused before any write', () => {
  const paths = sandbox();
  const before = snapshot(paths.base);
  for (const scope of ['project', 'local']) {
    assert.throws(() => install({ root: ROOT, env: paths.env, scope, project: paths.base }), /not supported yet/);
  }
  assert.deepEqual(snapshot(paths.base), before);
});

for (const [label, setup] of [
  ['a skill folder', (paths) => fs.mkdirSync(path.join(paths.skills, SKILL), { recursive: true })],
  ['a skill link to elsewhere', (paths) => {
    fs.mkdirSync(paths.skills, { recursive: true });
    fs.symlinkSync(paths.outside, path.join(paths.skills, SKILL), 'dir');
  }],
  ['an agent file', (paths) => {
    fs.mkdirSync(path.join(paths.home, 'agents'));
    fs.writeFileSync(path.join(paths.home, 'agents', AGENT_NAMES[0]), 'theirs\n');
  }],
  ['an agent symlink to a file outside', (paths) => {
    fs.mkdirSync(path.join(paths.home, 'agents'));
    fs.writeFileSync(path.join(paths.outside, 'target.toml'), 'theirs\n');
    fs.symlinkSync(path.join(paths.outside, 'target.toml'), path.join(paths.home, 'agents', AGENT_NAMES[0]));
  }],
  ['an unparseable hooks.json', (paths) => fs.writeFileSync(hooksPath(paths), '{ not json')],
  ['a hooks.json that is a list', (paths) => fs.writeFileSync(hooksPath(paths), '[]')],
  ['a PreToolUse entry that is not a list', (paths) => fs.writeFileSync(hooksPath(paths), '{"hooks":{"PreToolUse":{}}}')],
  ['an unparseable install record', (paths) => {
    fs.mkdirSync(path.join(paths.home, 'exo'));
    fs.writeFileSync(recordPath(paths), 'nope');
  }]
]) {
  test(`the install refuses ${label} before any write`, () => {
    const paths = sandbox();
    setup(paths);
    const before = snapshot(paths.base);
    const result = runInstaller(paths);
    assert.notEqual(result.status, 0);
    assert.notEqual(result.stderr, '');
    assert.deepEqual(snapshot(paths.base), before);
  });
}

test('an install refuses a skill file that is a link, or lies behind a linked folder, before any write', () => {
  const paths = sandbox();
  apply(paths);
  const entry = userInstall(paths).skills.find((skill) => skill.files.some((file) => file.path.includes('/')));
  const nested = entry.files.find((file) => file.path.includes('/')).path;
  const folder = path.join(paths.skills, entry.name, nested.split('/')[0]);
  fs.rmSync(folder, { recursive: true });
  fs.symlinkSync(paths.outside, folder, 'dir');
  const before = snapshot(paths.base);
  assert.throws(() => apply(paths), /exo did not write it/);
  assert.deepEqual(snapshot(paths.base), before);
  assert.deepEqual(fs.readdirSync(paths.outside), []);
  remove(selector(paths));
  assert.deepEqual(fs.readdirSync(paths.outside), []);
});

test('a forged record cannot make remove touch a path outside the folders', () => {
  const paths = sandbox();
  const victim = path.join(paths.outside, 'victim');
  fs.writeFileSync(victim, 'keep');
  fs.mkdirSync(path.join(paths.home, 'exo'));
  const write = (patch) => fs.writeFileSync(recordPath(paths), JSON.stringify({ version: 2, installs: [{ scope: 'user', skills: [], links: [], agents: [], hooks: [], ...patch }] }));
  for (const name of ['../outside/victim', victim, '..', 'a/b']) {
    write({ skills: [{ name, files: [] }] });
    assert.throws(() => remove(selector(paths)), undefined, name);
    write({ agents: [{ name: name.replace(/$/, '.toml'), sha256: 'x' }] });
    assert.throws(() => remove(selector(paths)), undefined, name);
    // A nested path of plain names is allowed, so only the escaping names fail here.
    if (name !== 'a/b') {
      write({ skills: [{ name: 'build', files: [{ path: name, sha256: hash('keep') }] }] });
      assert.throws(() => remove(selector(paths)), undefined, name);
    }
    assert.equal(fs.readFileSync(victim, 'utf8'), 'keep');
  }
});

test('a forged link source cannot make remove delete a link it did not write', () => {
  const paths = sandbox();
  fs.mkdirSync(paths.skills, { recursive: true });
  const theirs = path.join(paths.skills, 'build');
  fs.symlinkSync(paths.outside, theirs, 'dir');
  fs.mkdirSync(path.join(paths.home, 'exo'));
  fs.writeFileSync(recordPath(paths), JSON.stringify({ version: 1, skills: [{ name: 'build', source: path.join(ROOT, 'skills', 'build') }], agents: [], hooks: [] }));
  const result = remove(selector(paths));
  assert.match(result.notes.join('\n'), /not the link exo wrote/);
  assert.equal(fs.readlinkSync(theirs), paths.outside);
});

test('the record the old installer wrote reads as one user install and is replaced by copies', () => {
  const paths = sandbox();
  fs.mkdirSync(paths.skills, { recursive: true });
  fs.mkdirSync(path.join(paths.home, 'exo'));
  const source = path.join(ROOT, 'skills', SKILL);
  fs.symlinkSync(source, path.join(paths.skills, SKILL), 'dir');
  fs.writeFileSync(recordPath(paths), JSON.stringify({ version: 1, skills: [{ name: SKILL, source }], agents: [], hooks: [] }));
  apply(paths, update, { scope: undefined });
  const stat = fs.lstatSync(path.join(paths.skills, SKILL));
  assert.equal(stat.isDirectory(), true);
  assert.equal(stat.isSymbolicLink(), false);
  const record = readJson(recordPath(paths));
  assert.equal(record.version, 2);
  assert.equal(record.installs.length, 1);
  assert.deepEqual(record.installs[0].links, []);
  assert.deepEqual(fs.readdirSync(source).includes('SKILL.md'), true);
});

test('an update removes a skill the record lists but the clone no longer has', () => {
  const paths = sandbox();
  apply(paths);
  const folder = path.join(paths.skills, 'gone-skill');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'SKILL.md'), 'old\n');
  const record = readJson(recordPath(paths));
  record.installs[0].skills.push({ name: 'gone-skill', files: [{ path: 'SKILL.md', sha256: hash('old\n') }] });
  fs.writeFileSync(recordPath(paths), JSON.stringify(record));
  update(selector(paths));
  assert.equal(fs.existsSync(folder), false);
  assert.equal(userInstall(paths).skills.some((skill) => skill.name === 'gone-skill'), false);
});

test('an update rewrites a skill and an agent file the record says exo wrote', () => {
  const paths = sandbox();
  apply(paths);
  const old = 'older exo text\n';
  const agent = path.join(paths.home, 'agents', AGENT_NAMES[0]);
  const skill = path.join(paths.skills, SKILL, 'SKILL.md');
  const record = readJson(recordPath(paths));
  fs.writeFileSync(agent, old);
  fs.writeFileSync(skill, old);
  record.installs[0].agents.find((entry) => entry.name === AGENT_NAMES[0]).sha256 = hash(old);
  record.installs[0].skills.find((entry) => entry.name === SKILL).files.find((file) => file.path === 'SKILL.md').sha256 = hash(old);
  fs.writeFileSync(recordPath(paths), JSON.stringify(record));
  update(selector(paths));
  assert.equal(fs.readFileSync(agent, 'utf8'), TREE.get(`harnesses/codex/generated/agents/${AGENT_NAMES[0]}`).replaceAll('{{EXO_ROOT}}', ROOT));
  assert.equal(fs.readFileSync(skill, 'utf8').includes('{{'), false);
  assert.notEqual(fs.readFileSync(skill, 'utf8'), old);
});

test('an update with no record changes nothing', () => {
  const paths = sandbox();
  const before = snapshot(paths.base);
  assert.match(update(selector(paths)), /nothing to update/);
  assert.deepEqual(snapshot(paths.base), before);
});

test('the defaults come from CODEX_HOME and the home folder', () => {
  const paths = sandbox();
  const result = runInstaller(paths);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.lstatSync(path.join(paths.base, '.agents', 'skills', SKILL)).isDirectory(), true);
  assert.equal(fs.existsSync(recordPath(paths)), true);
  assert.equal(fs.existsSync(path.join(paths.home, 'agents', AGENT_NAMES[0])), true);
  assert.equal(fs.existsSync(SKILL_FILE), true);
});
