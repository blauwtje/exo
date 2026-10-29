import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOOK = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
const DAY_SECONDS = 24 * 60 * 60;

function workspace() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-session-prune-'));
  const project = path.join(base, 'project');
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(project, '.exo'), { recursive: true });
  fs.mkdirSync(home);
  return { base, project, home, exo: path.join(project, '.exo') };
}

function put(file, days) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  const seconds = Date.now() / 1000 - days * DAY_SECONDS;
  fs.utimesSync(file, seconds, seconds);
  return file;
}

function present(target) {
  return fs.lstatSync(target, { throwIfNoEntry: false }) !== undefined;
}

function startSession({ home, extraEnv = {}, input }) {
  const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), CLAUDE_PLUGIN_ROOT: REPOSITORY, ...extraEnv };
  delete env.TE_SIDECALL;
  delete env.EXO_RUN_DIR;
  Object.assign(env, extraEnv);
  const run = spawnSync(process.execPath, [HOOK], { env, input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
}

function fixtures(project, exo) {
  return {
    staleFile: put(path.join(exo, 'old.log'), 10),
    freshFile: put(path.join(exo, 'new.log'), 1),
    staleFolder: put(path.join(exo, 'old-work', 'note.md'), 10),
    activeRun: put(path.join(exo, 'run', 'state.json'), 30),
    staleLog: put(path.join(exo, 'logs', 'old.log'), 10),
    freshLog: put(path.join(exo, 'logs', 'new.log'), 1),
    protectedProgress: put(path.join(exo, 'last-work', 'progress.md'), 20),
    otherProgress: put(path.join(exo, 'older-work', 'progress.md'), 25),
    outside: put(path.join(project, 'outside.txt'), 30),
  };
}

function assertPruned(files, link, exo) {
  assert.equal(present(files.staleFile), false, 'a stale loose file stayed');
  assert.equal(present(path.dirname(files.staleFolder)), false, 'a stale folder stayed');
  assert.equal(present(files.staleLog), false, 'a stale log stayed');
  assert.equal(present(path.dirname(files.otherProgress)), false, 'an older progress folder stayed');
  assert.equal(present(files.freshFile), true, 'a fresh file went');
  assert.equal(present(files.freshLog), true, 'a fresh log went');
  assert.equal(present(files.activeRun), true, 'the run folder went');
  assert.equal(present(files.protectedProgress), true, 'the newest progress folder went');
  assert.equal(present(link), true, 'a symlink went');
  assert.equal(present(files.outside), true, 'a file outside .exo went');
  assert.equal(present(path.join(exo, 'pruned-at')), true, 'no stamp was written');
}

test('a session start prunes stale .exo entries and keeps the protected ones', () => {
  const { base, project, home, exo } = workspace();
  try {
    const files = fixtures(project, exo);
    const link = path.join(exo, 'link');
    fs.symlinkSync(files.outside, link);
    const past = Date.now() / 1000 - 30 * DAY_SECONDS;
    fs.lutimesSync(link, past, past);
    startSession({ home, input: { session_id: 's1', source: 'startup', cwd: project } });
    assertPruned(files, link, exo);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a prune within 24 hours of the stamp leaves stale entries', () => {
  const { base, project, home, exo } = workspace();
  try {
    put(path.join(exo, 'pruned-at'), 0);
    const stale = put(path.join(exo, 'old.log'), 10);
    startSession({ home, input: { session_id: 's1', source: 'startup', cwd: project } });
    assert.equal(present(stale), true, 'the walk ran despite a fresh stamp');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('TE_SIDECALL=1 and a detached run session prune nothing', () => {
  const { base, project, home, exo } = workspace();
  try {
    const stale = put(path.join(exo, 'old.log'), 10);
    const input = { session_id: 's1', source: 'startup', cwd: project };
    startSession({ home, extraEnv: { TE_SIDECALL: '1' }, input });
    startSession({ home, extraEnv: { EXO_RUN_DIR: project }, input });
    assert.equal(present(stale), true, 'a skipped session pruned');
    assert.equal(present(path.join(exo, 'pruned-at')), false, 'a skipped session wrote the stamp');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('no .exo folder and a non-string cwd create nothing', () => {
  const { base, project, home } = workspace();
  try {
    const bare = path.join(base, 'bare');
    fs.mkdirSync(bare);
    startSession({ home, input: { session_id: 's1', source: 'startup', cwd: bare } });
    startSession({ home, input: { session_id: 's1', source: 'startup', cwd: 42 } });
    assert.deepEqual(fs.readdirSync(bare), []);
    assert.deepEqual(fs.readdirSync(path.join(project, '.exo')), []);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a .exo that is a symlink is not walked', () => {
  const { base, project, home } = workspace();
  try {
    const target = path.join(base, 'elsewhere');
    const stale = put(path.join(target, 'old.log'), 10);
    const linked = path.join(base, 'linked');
    fs.mkdirSync(linked);
    fs.symlinkSync(target, path.join(linked, '.exo'));
    startSession({ home, input: { session_id: 's1', source: 'startup', cwd: linked } });
    assert.equal(present(stale), true, 'the walk followed the .exo symlink');
    assert.equal(present(path.join(target, 'pruned-at')), false, 'a stamp was written through the symlink');
    assert.ok(present(project));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
