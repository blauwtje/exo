// The version gate: three manifests carry one version, and any difference from
// the pushed base raises it. Ordering is numeric per field, because a string
// compare puts 0.10.0 below 0.2.0 and would pass an unbumped release.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkPluginVersion, compareVersions } from '../verify/checks/plugin-version.mjs';

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
function publishedRoot(t, version) {
  const root = scratchRoot(t);
  writeManifests(root, version);
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

test('fails on a new file the base does not have and no raise', (t) => {
  const root = publishedRoot(t, '0.1.0');
  fs.mkdirSync(path.join(root, 'skills', 'shipping'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'shipping', 'SKILL.md'), '# shipping\n');

  assert.equal(verdict(root).FAIL, 1);
});

test('passes the same new file once the version is raised', (t) => {
  const root = publishedRoot(t, '0.1.0');
  fs.mkdirSync(path.join(root, 'skills', 'shipping'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'shipping', 'SKILL.md'), '# shipping\n');
  writeManifests(root, '0.1.1');

  assert.equal(verdict(root).PASS, 1);
});

test('passes an unchanged tree without demanding a raise', (t) => {
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
