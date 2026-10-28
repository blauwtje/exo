import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkPaidBenchmarks, unguardedPaidBenchmarks } from '../verify/checks/paid-benchmarks.mjs';
import { createRepository } from '../verify/repository.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function repositoryWith(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paid-benchmarks-'));
  fs.mkdirSync(path.join(root, 'benchmarks'));
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(root, 'benchmarks', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return createRepository(root);
}

function runCheck(repository, exemptions) {
  const results = [];
  const report = { assert: (ok, name, pass, fail) => results.push({ ok, name, detail: ok ? pass : fail }) };
  checkPaidBenchmarks(report, repository, exemptions);
  return results;
}

const PAID_ENTRY = "const args = ['-p', prompt];\nconst options = process.argv.slice(2);\n";

test('a paid entry point with neither guard is flagged', () => {
  const repository = repositoryWith({ 'bare.mjs': PAID_ENTRY });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/bare.mjs']);
  const [result] = runCheck(repository);
  assert.equal(result.ok, false);
  assert.match(result.detail, /benchmarks\/bare\.mjs/);
});

test('a paid entry point with --dry-run or a quick tier passes', () => {
  const repository = repositoryWith({
    'dry.mjs': `${PAID_ENTRY}if (options.includes('--dry-run')) process.exit(0);\n`,
    'tiered.mjs': `${PAID_ENTRY}const mode = 'quick';\n`
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), []);
  assert.equal(runCheck(repository)[0].ok, true);
});

test('a paid helper without an argv entry point and a free script are not examined', () => {
  const repository = repositoryWith({
    'helper.mjs': "export const ARGS = ['-p', prompt];\n",
    'free.mjs': 'const options = process.argv.slice(2);\n'
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), []);
});

test('an API caller is paid', () => {
  const repository = repositoryWith({ 'api.mjs': "fetch('https://api.anthropic.com/v1/messages');\nprocess.argv;\n" });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/api.mjs']);
});

test('a paid entry point in a subdirectory is flagged', () => {
  const repository = repositoryWith({ 'deep/nested/drive.mjs': PAID_ENTRY });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/deep/nested/drive.mjs']);
});

test('a fixture, result or run folder is not examined', () => {
  const repository = repositoryWith({
    'fixtures/app/bare.mjs': PAID_ENTRY,
    'results/bare.mjs': PAID_ENTRY,
    'runs/bare.mjs': PAID_ENTRY,
    'value/task/bare.mjs': PAID_ENTRY
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), []);
});

test('a confined claude launch or a sweep runClaude call is paid', () => {
  const repository = repositoryWith({
    'confined.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n',
    'sub/forked.mjs': "import { runClaude } from '../sweep.mjs';\nawait runClaude(cell);\nprocess.argv;\n"
  });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/confined.mjs', 'benchmarks/sub/forked.mjs']);
});

test('a --confirm guard alone is not a quick tier', () => {
  const repository = repositoryWith({ 'confirm.mjs': `${PAID_ENTRY}if (!options.includes('--confirm')) process.exit(2);\n` });
  assert.deepEqual(unguardedPaidBenchmarks(repository), ['benchmarks/confirm.mjs']);
});

const GUARDED = "const options = process.argv.slice(2);\nconst dry = options.includes('--dry-run');\nconst mode = 'quick';\n";

test('a helper exempted with a caller that has --dry-run and a quick tier passes and prints its reason', () => {
  const repository = repositoryWith({ 'helper.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n', 'caller.mjs': GUARDED });
  const exemptions = { 'benchmarks/helper.mjs': { callers: ['benchmarks/caller.mjs'], reason: 'started only by caller.mjs' } };
  assert.deepEqual(unguardedPaidBenchmarks(repository, exemptions), []);
  const [result] = runCheck(repository, exemptions);
  assert.equal(result.ok, true);
  assert.match(result.detail, /benchmarks\/helper\.mjs: started only by caller\.mjs/);
});

test('an exemption whose caller lacks --dry-run or a quick tier does not exempt', () => {
  const repository = repositoryWith({
    'helper.mjs': 'const run = confinedClaude({ args });\nprocess.argv;\n',
    'caller.mjs': "const options = process.argv.slice(2);\nconst dry = options.includes('--dry-run');\n"
  });
  const exemptions = { 'benchmarks/helper.mjs': { callers: ['benchmarks/caller.mjs'], reason: 'started only by caller.mjs' } };
  assert.deepEqual(unguardedPaidBenchmarks(repository, exemptions), ['benchmarks/helper.mjs']);
});

test('a repository without benchmarks passes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paid-benchmarks-'));
  assert.deepEqual(unguardedPaidBenchmarks(createRepository(root)), []);
});

test('this repository passes', () => {
  assert.deepEqual(unguardedPaidBenchmarks(createRepository(ROOT)), []);
});
