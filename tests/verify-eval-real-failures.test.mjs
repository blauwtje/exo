import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADHD_FAILURE_SOURCES, MIN_REAL_FAILURES, adhdFailureCases, casesWithoutProvenance, checkEvalRealFailures, realFailureCount } from '../verify/checks/eval-real-failures.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const SHA = 'a'.repeat(40);

function repositoryWith(cases, adhd = []) {
  const root = tempDir('eval-real-failures-');
  for (const [id, definition] of Object.entries(cases)) {
    const folder = path.join(root, 'benchmarks/replay/cases', id);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'case.json'), typeof definition === 'string' ? definition : JSON.stringify(definition));
  }
  if (adhd.length > 0) {
    fs.mkdirSync(path.join(root, 'benchmarks/adhd'), { recursive: true });
    fs.writeFileSync(path.join(root, 'benchmarks/adhd/cases.jsonl'), adhd.map((entry) => JSON.stringify(entry)).join('\n'));
  }
  return createRepository(root);
}

function runCheck(repository) {
  const results = [];
  const report = { assert: (ok, name, pass, fail) => results.push({ ok, detail: ok ? pass : fail }) };
  checkEvalRealFailures(report, repository);
  return results;
}

const failureCase = (extra = {}) => ({ kind: 'case', ready: true, provenance: { type: 'fix-commit', ref: SHA }, ...extra });

function manyCases(count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`c${index}`, failureCase()]));
}

test('a case without provenance is flagged NO-PROVENANCE', () => {
  const repository = repositoryWith({ bare: { kind: 'case' } });
  assert.deepEqual(casesWithoutProvenance(repository).map(({ id }) => id), ['bare']);
  assert.match(runCheck(repository)[0].detail, /^NO-PROVENANCE benchmarks\/replay\/cases\/bare: no provenance object/);
});

test('a short commit ref, an unknown type, an empty ref and bad JSON are flagged', () => {
  const repository = repositoryWith({
    short: failureCase({ provenance: { type: 'fix-commit', ref: 'abc123' } }),
    odd: failureCase({ provenance: { type: 'rumour', ref: 'x' } }),
    empty: failureCase({ provenance: { type: 'run-dir', ref: ' ' } }),
    broken: '{'
  });
  assert.deepEqual(casesWithoutProvenance(repository).map(({ id }) => id), ['broken', 'empty', 'odd', 'short']);
});

test('a control must carry control provenance and a failure case must not', () => {
  const repository = repositoryWith({
    good: { kind: 'control', provenance: { type: 'control', ref: 'run-1' } },
    wrong: { kind: 'control', provenance: { type: 'run-dir', ref: 'run-1' } },
    mixed: failureCase({ provenance: { type: 'control', ref: 'run-1' } })
  });
  assert.deepEqual(casesWithoutProvenance(repository).map(({ id }) => id), ['mixed', 'wrong']);
});

test('controls, unready cases and cases without provenance do not count', () => {
  const repository = repositoryWith({
    ...manyCases(3),
    control: { kind: 'control', provenance: { type: 'control', ref: 'run-1' } },
    unready: failureCase({ ready: false }),
    bare: { kind: 'case' }
  });
  assert.equal(realFailureCount(repository), 3);
});

test('adhd cases from a failure source count and other sources do not', () => {
  const repository = repositoryWith({}, [{ id: 'a', source: ADHD_FAILURE_SOURCES[0] }, { id: 'b', source: 'exo chat' }]);
  assert.deepEqual(adhdFailureCases(repository), ['a']);
});

test('a count below the minimum fails with TOO-FEW-REAL-FAILURES and the minimum passes', () => {
  const few = runCheck(repositoryWith(manyCases(MIN_REAL_FAILURES - 1)));
  assert.equal(few[0].ok, true);
  assert.equal(few[1].ok, false);
  assert.match(few[1].detail, new RegExp(`^TOO-FEW-REAL-FAILURES ${MIN_REAL_FAILURES - 1} of ${MIN_REAL_FAILURES}`));
  const enough = runCheck(repositoryWith(manyCases(MIN_REAL_FAILURES)));
  assert.deepEqual(enough.map(({ ok }) => ok), [true, true]);
});

test('this repository passes its own check', () => {
  const repository = createRepository(path.resolve(import.meta.dirname, '..'));
  assert.deepEqual(runCheck(repository).map(({ ok }) => ok), [true, true]);
});

test('the real-failure minimum comes from defaults.eval', () => {
  const home = tempDir('eval-defaults-');
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { eval: { realFailuresMin: 9 } } }));
  const script = "import('./verify/checks/eval-real-failures.mjs').then((m) => console.log(m.MIN_REAL_FAILURES))";
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.join(import.meta.dirname, '..'), encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(Number(run.stdout), 9);
});
