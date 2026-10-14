import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkChangelogPlacement } from '../verify/checks/changelog-placement.mjs';

const RELEASED = ['# Changelog', '', '## Unreleased', '', '## 1.0.0 - 2026-01-01', '', '- first release', ''];

function git(root, args) {
  const identity = ['-c', 'user.name=exo', '-c', 'user.email=exo@example.com', '-c', 'commit.gpgsign=false'];
  const done = spawnSync('git', ['-C', root, ...identity, ...args], { encoding: 'utf8' });
  assert.equal(done.status, 0, done.stderr);
}

function releasedRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-changelog-placement-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '--quiet']);
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), RELEASED.join('\n'), 'utf8');
  git(root, ['add', 'CHANGELOG.md']);
  git(root, ['commit', '--quiet', '-m', 'chore(release): 1.0.0']);
  return root;
}

function verdict(root) {
  const report = createReport();
  const printed = [];
  const log = console.log;
  console.log = (line) => printed.push(String(line));
  try {
    checkChangelogPlacement(report, createRepository(root));
  } finally {
    console.log = log;
  }
  return { counts: report.counts(), detail: printed.join('\n') };
}

function withBullet(root, heading) {
  const file = path.join(root, 'CHANGELOG.md');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.splice(lines.indexOf(heading) + 1, 0, '', '- added after the release');
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

test('a line added under a released heading fails and is named', (t) => {
  const root = releasedRepository(t);
  withBullet(root, '## 1.0.0 - 2026-01-01');
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL, 1, detail);
  assert.match(detail, /CHANGELOG\.md:\d+ under "## 1\.0\.0 - 2026-01-01"/);
});

test('a line added under Unreleased passes', (t) => {
  const root = releasedRepository(t);
  withBullet(root, '## Unreleased');
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL, 0, detail);
  assert.equal(counts.PASS, 1, detail);
});

test('no release commit passes with a detail', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-changelog-placement-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), RELEASED.join('\n'), 'utf8');
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL, 0, detail);
  assert.match(detail, /nothing to compare/);
});
