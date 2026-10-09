// The routing check ranks sample prompts against skill descriptions. The
// fixtures copy this repository's skills/ and sample file, so each case is a
// fact about this corpus.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkRouting } from '../verify/checks/routing.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SAMPLES = 'verify/routing-samples.json';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-routing-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(REPOSITORY_ROOT, 'skills'), path.join(root, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, 'verify'));
  fs.copyFileSync(path.join(REPOSITORY_ROOT, SAMPLES), path.join(root, SAMPLES));
  return root;
}

function verdict(root) {
  const report = createReport();
  const printed = [];
  const log = console.log;
  console.log = (line) => printed.push(String(line));
  try {
    checkRouting(report, createRepository(root));
  } finally {
    console.log = log;
  }
  return { counts: report.counts(), detail: printed.join('\n') };
}

// The check counts every sample prompt and every negative as one case.
function sampleCount(root) {
  const samples = JSON.parse(fs.readFileSync(path.join(root, SAMPLES), 'utf8'));
  return Object.values(samples).reduce((total, entries) => total + entries.length, 0);
}

function editSamples(root, edit) {
  const file = path.join(root, SAMPLES);
  const samples = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(samples);
  fs.writeFileSync(file, JSON.stringify(samples), 'utf8');
}

test('every sample in this repository ranks its own skill first', (t) => {
  const root = fixture(t);
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL + counts.WARN + counts.UNRUN, 0, detail);
  assert.match(detail, new RegExp(`${sampleCount(root)} sample prompts.*at 1\\.00`));
});

test('a negative sample that another skill outranks fails the rank-1 rate', (t) => {
  const root = fixture(t);
  editSamples(root, (samples) => { samples.negatives[0].winner = 'ship'; });
  const count = sampleCount(root);
  const rate = ((count - 1) / count).toFixed(2).replace('.', '\\.');
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL, 1, detail);
  assert.match(detail, new RegExp(`rank-1 rate ${rate} is below the locked 1.*belongs to ship`));
});

test('a lock lower than the one on origin/main fails', (t) => {
  const root = fixture(t);
  const git = (...args) => spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  fs.writeFileSync(path.join(root, 'verify/budgets.mjs'), 'export const ROUTING_RANK_ONE_LOCK = 1.5;\n', 'utf8');
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL, 1, detail);
  assert.match(detail, /ROUTING_RANK_ONE_LOCK 1 is lower than 1\.5 on origin\/main/);
});

test('standalone run prints its line and exits 0 on a pass', () => {
  const run = spawnSync(process.execPath, [path.join(REPOSITORY_ROOT, 'verify/checks/routing.mjs')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /^\[PASS\] routing:/);
});

test('a sample that fits another skill better fails and names both', (t) => {
  const root = fixture(t);
  editSamples(root, (samples) => { samples.refactor[0] = 'Push my commits, open a pull request, and watch the pull request'; });
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL, 1, detail);
  assert.match(detail, /Push my commits.*belongs to refactor.*ship outranks it/);
});

test('two descriptions that share too many words fail', (t) => {
  const root = fixture(t);
  const read = (name) => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8').match(/^description: (.+)$/m)[1];
  const file = path.join(root, 'skills/design-ui/SKILL.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^description: .+$/m, `description: ${read('spec')}`), 'utf8');
  const { counts, detail } = verdict(root);
  assert.ok(counts.FAIL >= 1, detail);
  assert.match(detail, /design-ui and spec descriptions overlap 1\.00/);
});

test('a skill with fewer than two samples fails', (t) => {
  const root = fixture(t);
  editSamples(root, (samples) => { samples.verify = samples.verify.slice(0, 1); });
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL, 1, detail);
  assert.match(detail, /verify has fewer than two sample prompts/);
});
