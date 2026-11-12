import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { incompleteDenyRows, strayDenies, unrememberedRefusals } from '../verify/checks/hook-refusals.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function scan(files) {
  const root = tempDir('hook-refusals-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return unrememberedRefusals(createRepository(root));
}

test('every shipped hook sends its refusals through the shared helper', () => {
  assert.deepEqual(unrememberedRefusals(createRepository(ROOT)), []);
});

test('a hook that writes a deny straight to stdout is flagged', () => {
  const text = "const out = { hookSpecificOutput: { permissionDecision: 'deny' } };\nprocess.stdout.write(JSON.stringify(out));\n";
  assert.deepEqual(scan({ 'hooks/bad.mjs': text }), ['hooks/bad.mjs:2 writes hook output past writeHookOutput', 'hooks/bad.mjs refuses without lib/hook-refusal.mjs']);
});

test('a hook that blocks with exit code 2 is flagged', () => {
  const text = "import { writeHookOutput } from '../lib/hook-refusal.mjs';\nprocess.stderr.write('no');\nprocess.exitCode = 2;\n";
  assert.deepEqual(scan({ 'hooks/exit.mjs': text }), ['hooks/exit.mjs:3 blocks with exit code 2 past writeHookOutput']);
});

test('a hook that writes through the helper passes', () => {
  const text = "import { writeHookOutput } from '../lib/hook-refusal.mjs';\nwriteHookOutput({}, { decision: 'block', reason: 'x' }, 'good');\n";
  assert.deepEqual(scan({ 'hooks/good.mjs': text, 'lib/other.mjs': 'process.stdout.write("x");\n' }), []);
});

test('a deny written outside lib/lazy-steps.mjs is flagged and the run hooks are exempt', () => {
  const root = tempDir('stray-deny-');
  fs.mkdirSync(path.join(root, 'lib'));
  fs.mkdirSync(path.join(root, 'hooks'));
  fs.writeFileSync(path.join(root, 'lib/bad.mjs'), "export const f = () => ({ permissionDecision: 'deny' });\n");
  fs.writeFileSync(path.join(root, 'lib/lazy-steps.mjs'), "export const deny = () => ({ permissionDecision: 'deny' });\n");
  fs.writeFileSync(path.join(root, 'hooks/run-no-wait.mjs'), "export const f = () => ({ permissionDecision: 'deny' });\n");
  assert.deepEqual(strayDenies(createRepository(root)), ['lib/bad.mjs writes a deny outside lib/lazy-steps.mjs']);
});

test('a denying row needs one pass and one deny fixture', () => {
  assert.deepEqual(incompleteDenyRows(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/hook-refusal-calls.json'), 'utf8'))), []);
  assert.ok(incompleteDenyRows([]).includes('stash lacks a pass fixture'));
});
