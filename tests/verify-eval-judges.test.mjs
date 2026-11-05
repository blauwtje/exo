import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkEvalJudges, judgeFailures, skippedJudges } from '../verify/checks/eval-judges.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const GOOD = { name: 'j', kind: 'grader', dimension: 'facts', files: ['benchmarks/judges/j.md'], scorer: 'benchmarks/j-score.mjs' };
const SCORER = "import { calibrationLines } from './judge-calibration.mjs';\nexport const line = calibrationLines(['j']);\n";

function repositoryWith(judges, files = {}) {
  const root = tempDir('eval-judges-');
  const all = { 'benchmarks/judges.json': JSON.stringify({ judges }), 'benchmarks/judges/j.md': 'prompt', 'benchmarks/j-score.mjs': SCORER, ...files };
  for (const [name, source] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), source);
  }
  return createRepository(root);
}

const rows = (pairs) => `${pairs.map(([label, verdict], index) => JSON.stringify({ id: `i${index}`, dimension: 'facts', label, verdict, labeler: 'rater-1' })).join('\n')}\n`;
const labelFiles = (pairs) => ({
  'benchmarks/judge-labels/j.jsonl': rows(pairs),
  'benchmarks/judge-verdicts/j.jsonl': rows(pairs.map(([label, verdict]) => [label, verdict])),
});
const repeat = (pair, times) => Array.from({ length: times }, () => pair);

test('a judge that declares one dimension and prints its status passes without labels', () => {
  assert.deepEqual(judgeFailures(repositoryWith([GOOD])), []);
});

test('no registry, several dimensions or none are named failures', () => {
  assert.match(judgeFailures(createRepository(tempDir('eval-judges-')))[0], /^NO-REGISTRY/);
  assert.match(judgeFailures(repositoryWith([{ ...GOOD, dimension: ['facts', 'tone'] }]))[0], /^DIMENSIONS j: 2 dimensions/);
  assert.match(judgeFailures(repositoryWith([{ ...GOOD, dimension: undefined }]))[0], /^NO-DIMENSION j/);
});

test('a prompt whose reply template has two scales fails; one matching key, with or without evidence, passes', () => {
  const twoScales = { 'benchmarks/judges/j.md': 'Reply with JSON only:\n\n{"facts": 1, "tone": 1}\n' };
  assert.match(judgeFailures(repositoryWith([GOOD], twoScales))[0], /^DIMENSIONS j: benchmarks\/judges\/j\.md replies with \["facts","tone"\]/);
  assert.match(judgeFailures(repositoryWith([GOOD], { 'benchmarks/judges/j.md': '{"tone": 1}' }))[0], /^DIMENSIONS j: .*\["tone"\]/);
  assert.match(judgeFailures(repositoryWith([GOOD], { 'benchmarks/judges/j.md': '{"evidence": "x"}' }))[0], /^DIMENSIONS j: .*\[\]/);
  assert.deepEqual(judgeFailures(repositoryWith([GOOD], { 'benchmarks/judges/j.md': '{"a": 1}\n{"facts": 1, "evidence": "why"}\n' })), []);
  assert.match(judgeFailures(repositoryWith([GOOD], { 'benchmarks/judges/j.md': '{"facts": 1}\n{"facts": 1, "tone": 2}\n' }))[0], /^DIMENSIONS j/);
});

test('a prompt with no JSON reply template is skipped, and the real skipped judges are pinned', () => {
  assert.deepEqual(judgeFailures(repositoryWith([GOOD], { 'benchmarks/judges/j.md': 'Reply PASS or FAIL.' })), []);
  assert.deepEqual(skippedJudges(repositoryWith([GOOD], { 'benchmarks/judges/j.md': 'Reply PASS or FAIL.' })), ['j']);
  assert.deepEqual(skippedJudges(createRepository(path.join(import.meta.dirname, '..'))), ['pressure-line', 'adhd-facts']);
});

test('a judge prompt missing from the registry, a scorer without a status line and a missing file fail', () => {
  assert.match(judgeFailures(repositoryWith([GOOD], { 'benchmarks/other/judge-x.md': 'p' }))[0], /^UNREGISTERED benchmarks\/other\/judge-x\.md/);
  assert.match(judgeFailures(repositoryWith([GOOD], { 'benchmarks/j-score.mjs': 'export const x = 1;\n' }))[0], /^NO-STATUS j/);
  assert.match(judgeFailures(repositoryWith([{ ...GOOD, files: ['benchmarks/gone.md'] }]))[0], /^MISSING-FILE j/);
});

test('human labels below the kappa threshold fail; too few labels or strong agreement pass', () => {
  const weak = [...repeat(['PASS', 'PASS'], 20), ...repeat(['PASS', 'FAIL'], 10), ...repeat(['FAIL', 'PASS'], 10), ...repeat(['FAIL', 'FAIL'], 20)];
  assert.match(judgeFailures(repositoryWith([GOOD], labelFiles(weak)))[0], /^UNCALIBRATED j/);
  assert.deepEqual(judgeFailures(repositoryWith([GOOD], labelFiles(weak.slice(0, 10)))), []);
  assert.deepEqual(judgeFailures(repositoryWith([GOOD], labelFiles([...repeat(['PASS', 'PASS'], 30), ...repeat(['FAIL', 'FAIL'], 30)]))), []);
});

test('checkEvalJudges reports one result and the real repository passes', () => {
  const results = [];
  const report = { assert: (ok, name, pass, fail) => results.push({ ok, name, detail: ok ? pass : fail }) };
  checkEvalJudges(report, createRepository(path.join(import.meta.dirname, '..')));
  assert.deepEqual(results.map((result) => [result.ok, result.name]), [[true, 'eval judges']]);
});
