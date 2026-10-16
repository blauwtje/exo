import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { makeDefaultOptionsHome } from '../lib/default-options-home.mjs';
import { makeRunFolder } from '../skills/edit-skills/scripts/pressure.mjs';

function git(cwd, home, args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' } });
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
}

function removeAll(paths) {
  for (const target of paths) if (target) fs.rmSync(target, { recursive: true, force: true });
}

test('a host without a git identity commits as the plan placeholder', () => {
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-run-folder-home-'));
  const saved = { HOME: process.env.HOME, XDG: process.env.XDG_CONFIG_HOME, NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  let folder;
  try {
    process.env.HOME = emptyHome;
    process.env.XDG_CONFIG_HOME = path.join(emptyHome, 'xdg');
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    folder = makeRunFolder('with', undefined);
    assert.equal(git(folder.scratch, emptyHome, ['log', '-1', '--format=%an <%ae>']), 'pressure <pressure@localhost>');
  } finally {
    for (const [key, value] of [['HOME', saved.HOME], ['XDG_CONFIG_HOME', saved.XDG], ['GIT_CONFIG_NOSYSTEM', saved.NOSYSTEM]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    removeAll([emptyHome, folder && path.dirname(folder.scratch)]);
  }
});

test('the scratch folder is a git repository where a worktree commit works under the options-free HOME', () => {
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-run-folder-home-'));
  const realHome = process.env.HOME;
  let mirror;
  let folder;
  try {
    process.env.HOME = emptyHome;
    mirror = makeDefaultOptionsHome();
    folder = makeRunFolder('with', undefined);
    const worktree = path.join(folder.tmp, 'agent-worktree');
    git(folder.scratch, mirror, ['worktree', 'add', worktree]);
    fs.writeFileSync(path.join(worktree, 'note.txt'), 'x\n');
    git(worktree, mirror, ['add', 'note.txt']);
    git(worktree, mirror, ['commit', '-m', 'note']);
    assert.equal(git(worktree, mirror, ['log', '-1', '--format=%s']), 'note');
  } finally {
    process.env.HOME = realHome;
    removeAll([emptyHome, mirror, folder && path.dirname(folder.scratch)]);
  }
});
