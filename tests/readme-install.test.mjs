// README's clone-and-install line, run for Codex from a fresh clone under a
// temporary home, installs exo into that home, and its remove line undoes the install.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const CLONE_URL = 'https://github.com/blauwtje/exo';

function installSection() {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const start = readme.indexOf('\n## Install');
  assert.notEqual(start, -1, 'README has an Install section');
  const end = readme.indexOf('\n## ', start + 1);
  return readme.slice(start, end === -1 ? undefined : end);
}

function readmeLine(section, pattern) {
  const line = section.split('\n').find((candidate) => pattern.test(candidate));
  assert.ok(line, `README names a line matching ${pattern}`);
  return line.match(/`([^`]+)`/)?.[1] ?? line;
}

// A repository holding this checkout's files, so the README's clone line has a
// source that carries uncommitted work too.
function sourceRepository(base) {
  const source = path.join(base, 'source');
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  for (const file of listed.stdout.split('\0').filter(Boolean)) {
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(source, file));
  }
  // maintenance.auto=false: the commit would otherwise detach a `git maintenance run --auto` that
  // packs the ~900 loose objects and deletes them while the README's clone line copies them.
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', ...args], { cwd: source, encoding: 'utf8' });
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'fixture']]) {
    const result = git(...args);
    assert.equal(result.status, 0, result.stderr);
  }
  return source;
}

function run(command, environment, cwd) {
  return spawnSync('sh', ['-c', command], { cwd, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('README clone line installs Codex from a fresh clone and the remove line undoes it', () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'readme-install-')));
  try {
    const home = path.join(base, 'home');
    const bin = path.join(base, 'bin');
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
    const environment = {
      HOME: home,
      USERPROFILE: home,
      PATH: [bin, path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter)
    };

    const section = installSection();
    const cloneLine = readmeLine(section, /git clone .*install\.mjs/);
    assert.ok(cloneLine.includes(CLONE_URL), 'the install line clones the public repository');
    // The line installs into every detected harness; --harness codex keeps a
    // `claude` on this PATH from installing into the real Claude Code.
    const install = /--harness/.test(cloneLine) ? cloneLine : `${cloneLine} --harness codex`;
    const source = sourceRepository(base);
    const installed = run(install.replace(CLONE_URL, source).replaceAll('~', home), environment, base);
    assert.equal(installed.status, 0, installed.stderr + installed.stdout);

    const clone = path.join(home, '.exo');
    assert.ok(fs.existsSync(path.join(clone, '.git')), 'the line clones into ~/.exo');
    assert.ok(fs.existsSync(path.join(home, '.agents', 'skills', 'build', 'SKILL.md')), 'a skill is installed');
    assert.ok(fs.readdirSync(path.join(home, '.codex', 'agents')).some((name) => /^exo-.*\.toml$/.test(name)), 'an agent is installed');
    const hooks = JSON.parse(fs.readFileSync(path.join(home, '.codex', 'hooks.json'), 'utf8'));
    assert.ok(JSON.stringify(hooks).includes('harnesses/codex/hook-entry.mjs'), 'hooks run through the Codex entry');
    assert.ok(fs.existsSync(path.join(home, '.codex', 'exo', 'installed.json')), 'the install is recorded');

    const removal = readmeLine(section, /--remove/);
    const removed = run(removal.replaceAll('~', home), environment, base);
    assert.equal(removed.status, 0, removed.stderr + removed.stdout);
    assert.ok(!fs.existsSync(path.join(home, '.agents', 'skills', 'build')), 'the skill is removed');
    const left = fs.existsSync(path.join(home, '.codex', 'agents')) ? fs.readdirSync(path.join(home, '.codex', 'agents')) : [];
    assert.deepEqual(left, [], 'the agents are removed');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
