// makeDefaultOptionsHome mirrors the real home so a claude run started with
// HOME set to the mirror reads settings without the user's exo options, while
// every other entry of the home and of ~/.claude stays reachable; pressure-home.mjs
// spawns every arm with that HOME.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { makeDefaultOptionsHome, withoutExoOptions } from '../lib/default-options-home.mjs';
import { pressureHome, withHome as withPressureHome } from '../skills/edit-skills/scripts/pressure-home.mjs';
import { tempDir } from './harness.mjs';

function withHome(home, body) {
  const before = process.env.HOME;
  const beforeConfig = process.env.CLAUDE_CONFIG_DIR;
  process.env.HOME = home;
  process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
  try {
    return body();
  } finally {
    process.env.HOME = before;
    if (beforeConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = beforeConfig;
  }
}

test('withoutExoOptions drops the options of exo@ configs only', () => {
  const text = JSON.stringify({
    model: 'sonnet',
    pluginConfigs: { 'exo@exo': { options: { budget: 'off' }, keep: 1 }, 'other@x': { options: { a: 1 } } }
  });
  const settings = JSON.parse(withoutExoOptions(text));
  assert.deepEqual(settings.pluginConfigs, { 'exo@exo': { keep: 1 }, 'other@x': { options: { a: 1 } } });
  assert.equal(settings.model, 'sonnet');
});

test('the mirror holds settings without exo options and links everything else', () => {
  const home = tempDir('default-options-home-test-');
  let mirror;
  try {
    fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
    fs.writeFileSync(path.join(home, '.gitconfig'), '[user]\n');
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ pluginConfigs: { 'exo@exo': { options: { budget: 'off' } } } }));
    mirror = withHome(home, makeDefaultOptionsHome);
    const settings = JSON.parse(fs.readFileSync(path.join(mirror, '.claude', 'settings.json'), 'utf8'));
    assert.equal(settings.pluginConfigs['exo@exo'].options, undefined);
    assert.equal(fs.readFileSync(path.join(mirror, '.gitconfig'), 'utf8'), '[user]\n');
    assert.equal(fs.realpathSync(path.join(mirror, '.claude', 'projects')), fs.realpathSync(path.join(home, '.claude', 'projects')));
    assert.match(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'), /budget/);
  } finally {
    if (mirror) fs.rmSync(mirror, { recursive: true, force: true });
  }
});

test('the mirror keeps exo entries linked but its plugin-root is separate from the real one', () => {
  const home = tempDir('default-options-home-test-');
  let mirror;
  try {
    fs.mkdirSync(path.join(home, '.claude', 'exo', 'handoff'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'exo', 'plugin-root'), '/real\n');
    mirror = withHome(home, makeDefaultOptionsHome);
    const mirrorExo = path.join(mirror, '.claude', 'exo');
    assert.equal(fs.lstatSync(mirrorExo).isDirectory(), true);
    assert.equal(fs.existsSync(path.join(mirrorExo, 'plugin-root')), false);
    assert.equal(fs.realpathSync(path.join(mirrorExo, 'handoff')), fs.realpathSync(path.join(home, '.claude', 'exo', 'handoff')));
    fs.writeFileSync(path.join(mirrorExo, 'plugin-root'), '/clone\n');
    assert.equal(fs.readFileSync(path.join(home, '.claude', 'exo', 'plugin-root'), 'utf8'), '/real\n');
  } finally {
    if (mirror) fs.rmSync(mirror, { recursive: true, force: true });
  }
});

test('a home without an exo folder gets a mirror without one', () => {
  const home = tempDir('default-options-home-test-');
  let mirror;
  try {
    fs.mkdirSync(path.join(home, '.claude'));
    mirror = withHome(home, makeDefaultOptionsHome);
    assert.equal(fs.existsSync(path.join(mirror, '.claude', 'exo')), false);
  } finally {
    if (mirror) fs.rmSync(mirror, { recursive: true, force: true });
  }
});

test('a home whose exo is a file gets a mirror without an exo folder', () => {
  const home = tempDir('default-options-home-test-');
  let mirror;
  try {
    fs.mkdirSync(path.join(home, '.claude'));
    fs.writeFileSync(path.join(home, '.claude', 'exo'), 'not a folder\n');
    mirror = withHome(home, makeDefaultOptionsHome);
    assert.equal(fs.existsSync(path.join(mirror, '.claude', 'exo')), false);
  } finally {
    if (mirror) fs.rmSync(mirror, { recursive: true, force: true });
  }
});

test('a pressure run spawns claude with HOME set to the mirror, whose settings hold no exo options', () => {
  const home = tempDir('default-options-home-test-');
  let mirror;
  try {
    fs.mkdirSync(path.join(home, '.claude'));
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ pluginConfigs: { 'exo@exo': { options: { budget: 'off' } } } }));
    mirror = withHome(home, makeDefaultOptionsHome);
    const run = withPressureHome({ command: 'claude', args: [], env: { TMPDIR: '/tmp/x/' }, cwd: '/tmp' }, mirror);
    assert.equal(run.env.HOME, mirror);
    assert.equal(run.env.TMPDIR, '/tmp/x/');
    assert.notEqual(run.env.HOME, home);
    const settings = JSON.parse(fs.readFileSync(path.join(run.env.HOME, '.claude', 'settings.json'), 'utf8'));
    assert.equal(settings.pluginConfigs['exo@exo'].options, undefined);
  } finally {
    if (mirror) fs.rmSync(mirror, { recursive: true, force: true });
  }
});

test('with withoutClaudeMd the mirror has no CLAUDE.md and links the rest', () => {
  const home = tempDir('default-options-home-test-');
  let mirror;
  try {
    fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'global\n');
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{}');
    mirror = withHome(home, () => makeDefaultOptionsHome({ withoutClaudeMd: true }));
    assert.equal(fs.lstatSync(path.join(mirror, '.claude', 'CLAUDE.md'), { throwIfNoEntry: false }), undefined);
    assert.equal(fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8'), 'global\n');
    assert.equal(fs.realpathSync(path.join(mirror, '.claude', 'projects')), fs.realpathSync(path.join(home, '.claude', 'projects')));
    assert.equal(fs.existsSync(path.join(mirror, '.claude', 'settings.json')), true);
    const kept = withHome(home, () => makeDefaultOptionsHome());
    try {
      assert.equal(fs.readFileSync(path.join(kept, '.claude', 'CLAUDE.md'), 'utf8'), 'global\n');
    } finally {
      fs.rmSync(kept, { recursive: true, force: true });
    }
  } finally {
    if (mirror) fs.rmSync(mirror, { recursive: true, force: true });
  }
});

test('the pressure home turns off every installed plugin', () => {
  const home = tempDir('pressure-home-test-');
  let mirror;
  try {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'exo@blauwtje': true, 'tokeneconomizer@tokeneconomizer': true } }));
    mirror = withHome(home, () => pressureHome());
    const settings = JSON.parse(fs.readFileSync(path.join(mirror, '.claude', 'settings.json'), 'utf8'));
    assert.deepEqual(settings.enabledPlugins, { 'exo@blauwtje': false, 'tokeneconomizer@tokeneconomizer': false });
  } finally {
    if (mirror) fs.rmSync(mirror, { recursive: true, force: true });
  }
});

test('under CLAUDE_CONFIG_DIR the mirror comes from that directory and the child env drops it', () => {
  const home = tempDir('default-options-home-test-');
  const config = tempDir('default-options-home-config-');
  const before = process.env.CLAUDE_CONFIG_DIR;
  let mirror;
  try {
    fs.mkdirSync(path.join(home, '.claude'));
    fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ enabledPlugins: { 'other@x': true } }));
    mirror = withHome(home, () => {
      process.env.CLAUDE_CONFIG_DIR = config;
      return pressureHome();
    });
    const settings = JSON.parse(fs.readFileSync(path.join(mirror, '.claude', 'settings.json'), 'utf8'));
    assert.deepEqual(settings.enabledPlugins, { 'other@x': false });
    const run = withPressureHome({ env: { A: '1' } }, mirror);
    assert.equal(run.env.HOME, mirror);
    assert.equal(run.env.CLAUDE_CONFIG_DIR, undefined);
    assert.equal('CLAUDE_CONFIG_DIR' in run.env, true);
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = before;
    if (mirror) fs.rmSync(mirror, { recursive: true, force: true });
  }
});
