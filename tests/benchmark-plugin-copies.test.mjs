import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BEFORE_ARM, beforeArm, beforePluginProblem, buildCopies, copyKey, exoRootOf, loadsCopy, withBeforeArm } from '../benchmarks/plugin-copies.mjs';
import { ARMS, DEFAULT_ARMS, ROOT } from '../benchmarks/tasks.mjs';

const TIERS = ['template', 'safe', 'git', 'calibration', 'value'];

function git(directory, args) {
  execFileSync('git', ['-C', directory, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { stdio: 'ignore' });
}

function pluginDirectory(marker, { repo = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-before-test-'));
  fs.mkdirSync(path.join(directory, '.claude-plugin'));
  fs.writeFileSync(path.join(directory, '.claude-plugin', 'plugin.json'), '{"name":"exo"}\n');
  fs.writeFileSync(path.join(directory, 'marker.txt'), marker);
  fs.mkdirSync(path.join(directory, 'benchmarks', 'value', 'x', 'hidden'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'benchmarks', 'value', 'x', 'hidden', 'secret.txt'), 'secret');
  if (repo) {
    git(directory, ['init', '-q']);
    git(directory, ['add', '-A']);
    git(directory, ['commit', '-q', '-m', 'init']);
  }
  return directory;
}

test('every arm keeps its copy key and its per-tier copy loading', () => {
  for (const [name, arm] of Object.entries(ARMS)) {
    assert.equal(copyKey(arm), arm.variant ?? 'plain', `${name} copyKey`);
    assert.equal(exoRootOf(arm), arm.pluginDirs.includes(ROOT) ? ROOT : null, `${name} exoRootOf`);
    for (const tier of TIERS) {
      const expected = arm.pluginDirs.includes(ROOT) && (tier === 'value' || arm.variant !== undefined);
      assert.equal(loadsCopy(arm, { tier }), expected, `${name} loadsCopy on ${tier}`);
    }
  }
});

test('exo loads a copy on value only; a variant arm loads one on every tier', () => {
  assert.equal(loadsCopy(ARMS.exo, { tier: 'value' }), true);
  assert.equal(loadsCopy(ARMS.exo, { tier: 'template' }), false);
  assert.equal(loadsCopy(ARMS['exo-pointer'], { tier: 'template' }), true);
  assert.equal(copyKey(ARMS['exo-pointer']), 'session-pointer');
  assert.equal(loadsCopy(ARMS.baseline, { tier: 'value' }), false);
});

test('exo-before copies from its own dir beside an exo arm copied from another', () => {
  const before = pluginDirectory('B');
  const arms = { exo: ARMS.exo, [BEFORE_ARM]: beforeArm(before) };
  const task = { id: 't', tier: 'value' };
  const cells = [{ task, arm: 'exo' }, { task, arm: BEFORE_ARM }];
  const made = [];
  const copies = buildCopies(cells, arms, () => {
    made.push(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-before-copy-')));
    return made[made.length - 1];
  });
  try {
    assert.equal(Object.keys(copies).length, 2);
    const exoCopy = copies[copyKey(arms.exo)];
    const beforeCopy = copies[copyKey(arms[BEFORE_ARM])];
    assert.notEqual(exoCopy, beforeCopy);
    assert.equal(fs.existsSync(path.join(exoCopy, 'marker.txt')), false);
    assert.equal(fs.existsSync(path.join(exoCopy, '.claude-plugin', 'plugin.json')), true);
    assert.equal(fs.readFileSync(path.join(beforeCopy, 'marker.txt'), 'utf8'), 'B');
    assert.equal(fs.existsSync(path.join(exoCopy, 'benchmarks')), false);
    assert.equal(fs.existsSync(path.join(beforeCopy, 'benchmarks')), false);
  } finally {
    for (const directory of [...made, before]) fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('exo-before loads no copy on a non-value tier and stays out of the default arms', () => {
  const arm = beforeArm('/somewhere');
  assert.equal(loadsCopy(arm, { tier: 'template' }), false);
  assert.equal(loadsCopy(arm, { tier: 'value' }), true);
  assert.equal(exoRootOf(arm), '/somewhere');
  assert.equal(DEFAULT_ARMS.includes(BEFORE_ARM), false);
  assert.equal(withBeforeArm(ARMS, null), ARMS);
  assert.equal(withBeforeArm(ARMS, '/somewhere')[BEFORE_ARM].exoRoot, '/somewhere');
  assert.equal(BEFORE_ARM in ARMS, false);
});

test('beforePluginProblem names each bad input', () => {
  const clean = pluginDirectory('B', { repo: true });
  const dirty = pluginDirectory('D', { repo: true });
  const notRepo = pluginDirectory('N');
  const notExo = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-before-test-'));
  fs.writeFileSync(path.join(dirty, 'marker.txt'), 'changed');
  try {
    assert.equal(beforePluginProblem(null, ['exo', BEFORE_ARM]), `arm ${BEFORE_ARM} needs --before-plugin <dir>`);
    assert.equal(beforePluginProblem(null, ['exo']), null);
    assert.equal(beforePluginProblem(undefined, [BEFORE_ARM]), '--before-plugin needs a directory');
    assert.equal(beforePluginProblem('', ['exo']), '--before-plugin needs a directory');
    assert.equal(beforePluginProblem(clean, ['exo']), `--before-plugin needs arm ${BEFORE_ARM} in --arms`);
    const missing = path.join(clean, 'absent');
    assert.equal(beforePluginProblem(missing, [BEFORE_ARM]), `--before-plugin ${missing}: no such directory`);
    assert.equal(beforePluginProblem(notExo, [BEFORE_ARM]), `--before-plugin ${notExo}: not an exo plugin (no .claude-plugin/plugin.json naming exo)`);
    assert.equal(beforePluginProblem(ROOT, [BEFORE_ARM]), `--before-plugin ${ROOT} is this checkout; give a worktree at the before commit`);
    assert.equal(beforePluginProblem(notRepo, [BEFORE_ARM]), `--before-plugin ${notRepo}: not a git checkout`);
    assert.equal(beforePluginProblem(dirty, [BEFORE_ARM]), `--before-plugin ${dirty} has uncommitted changes; the copy would not match its commit`);
    assert.equal(beforePluginProblem(clean, [BEFORE_ARM]), null);
  } finally {
    for (const directory of [clean, dirty, notRepo, notExo]) fs.rmSync(directory, { recursive: true, force: true });
  }
});
