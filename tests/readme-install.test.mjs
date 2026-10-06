// README's Codex install line, run through this checkout's install.sh under a
// temporary home, clones exo into that home and installs it, and README's remove
// line undoes the install.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const SCRIPT_URL = 'https://raw.githubusercontent.com/blauwtje/exo/main/install.sh';

function installSection() {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const start = readme.indexOf('\n## Install');
  assert.notEqual(start, -1, 'README has an Install section');
  const end = readme.indexOf('\n## ', start + 1);
  return readme.slice(start, end === -1 ? undefined : end);
}

// The README's `curl -fsSL <url> | bash -s -- <args>` line matching the pattern,
// rewritten to run this checkout's install.sh with the same arguments.
function readmeCommand(section, pattern) {
  const line = section.split('\n').find((candidate) => pattern.test(candidate) && candidate.includes(SCRIPT_URL));
  assert.ok(line, `README names a curl line matching ${pattern}`);
  const command = (line.match(/`([^`]+)`/)?.[1] ?? line).trim();
  const piped = `curl -fsSL ${SCRIPT_URL} | bash -s --`;
  assert.ok(command.startsWith(piped), `the line pipes install.sh into bash: ${command}`);
  return `bash ${path.join(ROOT, 'install.sh')}${command.slice(piped.length)}`;
}

// A repository holding this checkout's files, so install.sh has a clone
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
  // packs the ~900 loose objects and deletes them while install.sh clones them.
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', ...args], { cwd: source, encoding: 'utf8' });
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'fixture']]) {
    const result = git(...args);
    assert.equal(result.status, 0, result.stderr);
  }
  return source;
}

// detached: a new session has no controlling terminal, so install.sh cannot
// open /dev/tty and install.mjs takes its defaults instead of prompting.
function run(command, environment, cwd) {
  return spawnSync('sh', ['-c', command], { cwd, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], detached: true });
}

test('README Codex line installs exo through install.sh and the remove line undoes it', () => {
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
    const install = readmeCommand(section, /--harness codex/);
    const source = sourceRepository(base);
    environment.EXO_REPO = pathToFileURL(source).href;
    environment.EXO_DIR = path.join(home, '.exo');
    const installed = run(install, environment, base);
    assert.equal(installed.status, 0, installed.stderr + installed.stdout);

    const clone = path.join(home, '.exo');
    assert.ok(fs.existsSync(path.join(clone, '.git')), 'install.sh clones into EXO_DIR');
    assert.ok(fs.existsSync(path.join(home, '.agents', 'skills', 'build', 'SKILL.md')), 'a skill is installed');
    assert.ok(fs.readdirSync(path.join(home, '.codex', 'agents')).some((name) => /^exo-.*\.toml$/.test(name)), 'an agent is installed');
    const hooks = JSON.parse(fs.readFileSync(path.join(home, '.codex', 'hooks.json'), 'utf8'));
    assert.ok(JSON.stringify(hooks).includes('harnesses/codex/hook-entry.mjs'), 'hooks run through the Codex entry');
    assert.ok(fs.existsSync(path.join(home, '.codex', 'exo', 'installed.json')), 'the install is recorded');

    const removed = run(readmeCommand(section, /--remove/), environment, base);
    assert.equal(removed.status, 0, removed.stderr + removed.stdout);
    assert.ok(!fs.existsSync(path.join(home, '.agents', 'skills', 'build')), 'the skill is removed');
    const left = fs.existsSync(path.join(home, '.codex', 'agents')) ? fs.readdirSync(path.join(home, '.codex', 'agents')) : [];
    assert.deepEqual(left, [], 'the agents are removed');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
