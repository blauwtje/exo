// `harnesses/codex/install.mjs` links skills, copies agents and merges hook groups into
// Codex's user folders, records them, and removes exactly those. It refuses a
// file, link or hook group it did not write, and an unparseable hooks.json or
// install record, before any write; a forged record cannot name a path outside
// the folders.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { codexHookEntries } from '../harnesses/codex/hooks.mjs';

const ROOT = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const INSTALL = path.join(ROOT, 'harnesses', 'codex', 'install.mjs');
const AGENT_NAMES = fs.readdirSync(path.join(ROOT, 'harnesses', 'codex', 'agents')).filter((name) => name.endsWith('.toml'));
const SKILL_NAMES = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'route-skills')
  .map((entry) => entry.name);

function sandbox() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-install-')));
  const paths = {
    base,
    home: path.join(base, 'codex'),
    skills: path.join(base, 'agents-skills'),
    outside: path.join(base, 'outside')
  };
  fs.mkdirSync(paths.home, { recursive: true });
  fs.mkdirSync(paths.outside);
  return paths;
}

function run(paths, args = [], env = {}) {
  const flags = ['--codex-home', paths.home, '--skills-dir', paths.skills, ...args];
  return spawnSync(process.execPath, [INSTALL, ...flags], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
}

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

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const recordPath = (paths) => path.join(paths.home, 'exo', 'installed.json');
const hooksPath = (paths) => path.join(paths.home, 'hooks.json');

test('a fresh install links skills, copies agents, merges hooks and records them', () => {
  const paths = sandbox();
  fs.writeFileSync(path.join(paths.home, 'config.toml'), 'model = "x"\n');
  const result = run(paths);
  assert.equal(result.status, 0, result.stderr);
  for (const name of SKILL_NAMES) {
    const link = path.join(paths.skills, name);
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true, name);
    assert.equal(fs.readlinkSync(link), path.join(ROOT, 'skills', name));
  }
  assert.equal(fs.existsSync(path.join(paths.skills, 'route-skills')), false);
  for (const name of AGENT_NAMES) {
    assert.deepEqual(fs.readFileSync(path.join(paths.home, 'agents', name)), fs.readFileSync(path.join(ROOT, 'harnesses', 'codex', 'agents', name)));
  }
  assert.deepEqual(readJson(hooksPath(paths)), { hooks: codexHookEntries(ROOT) });
  const record = readJson(recordPath(paths));
  assert.equal(record.skills.length, SKILL_NAMES.length);
  assert.equal(record.agents.length, AGENT_NAMES.length);
  assert.equal(record.hooks.length, 4);
  assert.equal(fs.readFileSync(path.join(paths.home, 'config.toml'), 'utf8'), 'model = "x"\n');
});

test('a rerun changes nothing and keeps a foreign hook group', () => {
  const paths = sandbox();
  const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] };
  fs.writeFileSync(hooksPath(paths), JSON.stringify({ other: 1, hooks: { PreToolUse: [foreign] } }));
  assert.equal(run(paths).status, 0);
  const first = snapshot(paths.base);
  assert.equal(run(paths).status, 0);
  assert.deepEqual(snapshot(paths.base), first);
  const config = readJson(hooksPath(paths));
  assert.equal(config.other, 1);
  assert.deepEqual(config.hooks.PreToolUse[0], foreign);
  assert.equal(config.hooks.PreToolUse.length, 2);
});

test('--remove deletes exactly what the record lists and keeps the rest', () => {
  const paths = sandbox();
  const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] };
  fs.writeFileSync(hooksPath(paths), JSON.stringify({ hooks: { PreToolUse: [foreign] } }));
  fs.mkdirSync(path.join(paths.home, 'agents'));
  fs.writeFileSync(path.join(paths.home, 'agents', 'mine.toml'), 'name = "mine"\n');
  fs.mkdirSync(path.join(paths.skills, 'mine'), { recursive: true });
  assert.equal(run(paths).status, 0);
  const result = run(paths, ['--remove']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(paths.skills), ['mine']);
  assert.deepEqual(fs.readdirSync(path.join(paths.home, 'agents')), ['mine.toml']);
  assert.deepEqual(readJson(hooksPath(paths)), { hooks: { PreToolUse: [foreign] } });
  assert.equal(fs.existsSync(path.join(paths.home, 'exo')), false);
});

test('--remove with no record writes nothing', () => {
  const paths = sandbox();
  const before = snapshot(paths.base);
  const result = run(paths, ['--remove']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(paths.base), before);
});

test('--remove keeps an agent file edited after the install', () => {
  const paths = sandbox();
  assert.equal(run(paths).status, 0);
  const edited = path.join(paths.home, 'agents', AGENT_NAMES[0]);
  fs.appendFileSync(edited, '# mine\n');
  const result = run(paths, ['--remove']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /kept .*it is not the file exo wrote/);
  assert.equal(fs.existsSync(edited), true);
});

for (const [label, setup] of [
  ['a skill folder', (paths) => fs.mkdirSync(path.join(paths.skills, SKILL_NAMES[0]), { recursive: true })],
  ['a skill link to elsewhere', (paths) => {
    fs.mkdirSync(paths.skills, { recursive: true });
    fs.symlinkSync(paths.outside, path.join(paths.skills, SKILL_NAMES[0]), 'dir');
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
    const result = run(paths);
    assert.notEqual(result.status, 0);
    assert.notEqual(result.stderr, '');
    assert.deepEqual(snapshot(paths.base), before);
  });
}

test('a forged record cannot make --remove touch a path outside the folders', () => {
  const paths = sandbox();
  const victim = path.join(paths.outside, 'victim');
  fs.writeFileSync(victim, 'keep');
  fs.mkdirSync(path.join(paths.home, 'exo'));
  for (const name of ['../outside/victim', victim, '..', 'a/b']) {
    const record = { version: 1, skills: [{ name, source: victim }], agents: [], hooks: [] };
    fs.writeFileSync(recordPath(paths), JSON.stringify(record));
    const result = run(paths, ['--remove']);
    assert.notEqual(result.status, 0, name);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'keep');
    const agentRecord = { version: 1, skills: [], agents: [{ name: name.replace(/$/, '.toml'), sha256: 'x' }], hooks: [] };
    fs.writeFileSync(recordPath(paths), JSON.stringify(agentRecord));
    assert.notEqual(run(paths, ['--remove']).status, 0, name);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'keep');
  }
});

test('a forged record link source cannot make --remove delete a link it did not write', () => {
  const paths = sandbox();
  fs.mkdirSync(paths.skills);
  const theirs = path.join(paths.skills, 'build');
  fs.symlinkSync(paths.outside, theirs, 'dir');
  fs.mkdirSync(path.join(paths.home, 'exo'));
  fs.writeFileSync(recordPath(paths), JSON.stringify({ version: 1, skills: [{ name: 'build', source: path.join(ROOT, 'skills', 'build') }], agents: [], hooks: [] }));
  const result = run(paths, ['--remove']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readlinkSync(theirs), paths.outside);
});

test('an update removes a skill the record lists but the clone no longer has', () => {
  const paths = sandbox();
  assert.equal(run(paths).status, 0);
  const gone = path.join(paths.outside, 'gone-skill');
  fs.mkdirSync(gone);
  fs.symlinkSync(gone, path.join(paths.skills, 'gone-skill'), 'dir');
  const record = readJson(recordPath(paths));
  record.skills.push({ name: 'gone-skill', source: gone });
  fs.writeFileSync(recordPath(paths), JSON.stringify(record));
  assert.equal(run(paths).status, 0);
  assert.equal(fs.existsSync(path.join(paths.skills, 'gone-skill')), false);
  assert.equal(readJson(recordPath(paths)).skills.some((entry) => entry.name === 'gone-skill'), false);
});

test('an update rewrites an agent file the record says exo wrote', () => {
  const paths = sandbox();
  assert.equal(run(paths).status, 0);
  const file = path.join(paths.home, 'agents', AGENT_NAMES[0]);
  const old = 'older exo text\n';
  fs.writeFileSync(file, old);
  const record = readJson(recordPath(paths));
  record.agents.find((entry) => entry.name === AGENT_NAMES[0]).sha256 = crypto.createHash('sha256').update(old).digest('hex');
  fs.writeFileSync(recordPath(paths), JSON.stringify(record));
  assert.equal(run(paths).status, 0);
  assert.deepEqual(fs.readFileSync(file), fs.readFileSync(path.join(ROOT, 'harnesses', 'codex', 'agents', AGENT_NAMES[0])));
});

test('the defaults come from CODEX_HOME and the home folder', () => {
  const paths = sandbox();
  const result = spawnSync(process.execPath, [INSTALL], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: paths.base, USERPROFILE: paths.base, CODEX_HOME: paths.home }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.lstatSync(path.join(paths.base, '.agents', 'skills', SKILL_NAMES[0])).isSymbolicLink(), true);
  assert.equal(fs.existsSync(recordPath(paths)), true);
  assert.equal(fs.existsSync(path.join(paths.home, 'agents', AGENT_NAMES[0])), true);
});
