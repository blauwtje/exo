// The boundary-words gate: an edited prose file may not lose a word like `only` unless a
// `Drops:` line (commit body or EXO_DROPS) names the drop.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkBoundaryWords } from '../verify/checks/boundary-words.mjs';
import { SCENARIOS, runScenario } from '../verify/self-test.mjs';

const FILE = 'skills/x/SKILL.md';
const ORIGINAL = 'Use it only here, never twice.\n';

function git(root, ...args) {
  const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
}

function scratch(t, { published = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'skills/x'), { recursive: true });
  fs.writeFileSync(path.join(root, FILE), ORIGINAL);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'gate@example.com');
  git(root, 'config', 'user.name', 'gate');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  if (published) git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return root;
}

function run(root, env = {}) {
  const report = createReport();
  checkBoundaryWords(report, createRepository(root), { env });
  return report.counts();
}

function edit(root, text) {
  fs.writeFileSync(path.join(root, FILE), text);
}

test('fails a dropped word naming file, word and both counts', (t) => {
  const root = scratch(t);
  edit(root, 'Use it here, never twice.\n');
  const lines = [];
  const report = { result: (status, name, detail) => lines.push(`${status} ${name}: ${detail}`) };
  report.assert = (ok, name, pass, fail) => report.result(ok ? 'PASS' : 'FAIL', name, ok ? pass : fail);
  checkBoundaryWords(report, createRepository(root), { env: {} });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^FAIL boundary words: skills\/x\/SKILL\.md: only 1 -> 0/);
});

test('passes a rewording that keeps every count', (t) => {
  const root = scratch(t);
  edit(root, 'Never twice, and here only.\n');
  assert.equal(run(root).FAIL, 0);
  assert.equal(run(root).PASS, 1);
});

test('passes a named drop from EXO_DROPS', (t) => {
  const root = scratch(t);
  edit(root, 'Use it here, never twice.\n');
  assert.equal(run(root, { EXO_DROPS: `only in ${FILE}` }).FAIL, 0);
});

test('passes a named drop from a commit body', (t) => {
  const root = scratch(t);
  edit(root, 'Use it here, never twice.\n');
  git(root, 'commit', '-qam', 'reword', '-m', `Drops: only in ${FILE}`);
  assert.equal(run(root).FAIL, 0);
});

test('is UNRUN without origin/main', (t) => {
  const root = scratch(t, { published: false });
  edit(root, 'Use it here, never twice.\n');
  const counts = run(root);
  assert.equal(counts.UNRUN, 1);
  assert.equal(counts.FAIL, 0);
});

test('the self-test boundary scenario is rejected by exactly boundary words', async (t) => {
  const scenario = SCENARIOS.find((entry) => entry.boundaryBase);
  assert.ok(scenario);
  const selfRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-boundary-self-'));
  t.after(() => fs.rmSync(selfRoot, { recursive: true, force: true }));
  const repository = createRepository(path.resolve(import.meta.dirname, '..'));
  const verifier = path.resolve(import.meta.dirname, '..', 'verify.mjs');
  assert.equal(await runScenario(scenario, verifier, repository, selfRoot), null);
});
