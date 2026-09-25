// The version gate: three manifests carry one version. Between releases a
// change waits under `## Unreleased` in CHANGELOG.md, so a tree that differs
// from the pushed base needs that entry; a raised version needs its dated
// changelog section. Ordering is numeric per field, because a string compare
// puts 0.10.0 below 0.2.0.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkPluginVersion, compareVersions } from '../verify/checks/plugin-version.mjs';

const EMPTY_CHANGELOG = '# Changelog\n\n## Unreleased\n\n## 0.1.0 - 2026-09-10\n\n### Added\n\n- first\n';

function writeManifests(root, version) {
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'exo', version }));
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'exo', version }));
  fs.writeFileSync(
    path.join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'blauwtje', plugins: [{ name: 'exo', version }] })
  );
}

function scratchRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-version-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

// A base commit reachable as origin/main, without a remote to push to.
function publishedRoot(t, version, changelog = EMPTY_CHANGELOG) {
  const root = scratchRoot(t);
  writeManifests(root, version);
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['config', 'user.email', 'gate@example.com'],
    ['config', 'user.name', 'gate'],
    ['add', '.'],
    ['commit', '-qm', 'base'],
    ['update-ref', 'refs/remotes/origin/main', 'HEAD']
  ]) {
    const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(run.status, 0, `git ${args[0]} failed: ${run.stderr}`);
  }
  return root;
}

function addSkill(root) {
  fs.mkdirSync(path.join(root, 'skills', 'ship'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'ship', 'SKILL.md'), '# ship\n');
}

function verdict(root) {
  const report = createReport();
  checkPluginVersion(report, createRepository(root));
  return report.counts();
}

test('orders versions by number, not by string', () => {
  assert.equal(compareVersions('0.10.0', '0.2.0'), 1);
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1);
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
});

test('fails when one manifest lags behind the others', (t) => {
  const root = scratchRoot(t);
  writeManifests(root, '0.2.0');
  fs.writeFileSync(
    path.join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'blauwtje', plugins: [{ name: 'exo', version: '0.1.0' }] })
  );

  assert.equal(verdict(root).FAIL, 1);
});

test('cannot run without a base ref to compare against', (t) => {
  const root = scratchRoot(t);
  writeManifests(root, '0.2.0');

  assert.equal(verdict(root).UNRUN, 1);
});

test('fails on a new file with nothing under Unreleased', (t) => {
  const root = publishedRoot(t, '0.1.0');
  addSkill(root);

  assert.equal(verdict(root).FAIL, 1);
});

test('passes the same new file once Unreleased records it, without a raise', (t) => {
  const root = publishedRoot(t, '0.1.0');
  addSkill(root);
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), EMPTY_CHANGELOG.replace('## Unreleased\n', '## Unreleased\n\n### Added\n\n- ship\n'));

  assert.equal(verdict(root).PASS, 1);
});

test('passes a raised version that has its dated changelog section', (t) => {
  const root = publishedRoot(t, '0.1.0');
  addSkill(root);
  writeManifests(root, '0.2.0');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), EMPTY_CHANGELOG.replace('## Unreleased\n', '## Unreleased\n\n## 0.2.0 - 2026-09-20\n\n### Added\n\n- ship\n'));

  assert.equal(verdict(root).PASS, 1);
});

test('fails a raised version without its dated changelog section', (t) => {
  const root = publishedRoot(t, '0.1.0');
  writeManifests(root, '0.1.1');

  assert.equal(verdict(root).FAIL, 1);
});

test('fails a version below the pushed base', (t) => {
  const root = publishedRoot(t, '0.2.0');
  writeManifests(root, '0.1.9');

  assert.equal(verdict(root).FAIL, 1);
});

test('passes an unchanged tree', (t) => {
  const root = publishedRoot(t, '0.1.0');

  assert.equal(verdict(root).PASS, 1);
});

test('fails a version that is not three numeric fields', (t) => {
  const root = scratchRoot(t);
  writeManifests(root, '0.2.0-rc.1');

  assert.equal(verdict(root).FAIL, 1);
});

test('fails a malformed manifest instead of throwing out of the run', (t) => {
  const root = scratchRoot(t);
  writeManifests(root, '0.2.0');
  fs.writeFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), '{ not json');

  assert.equal(verdict(root).FAIL, 1);
});
