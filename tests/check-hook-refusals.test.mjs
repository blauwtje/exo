import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkHookRefusals, FIXTURES } from '../verify/checks/hook-refusals.mjs';
import { createRepository } from '../verify/repository.mjs';
import { REPOSITORY_ROOT as ROOT, tempDir } from './harness.mjs';


const REAL_FIXTURES = fs.readFileSync(path.join(ROOT, FIXTURES), 'utf8');
const ROUTE = ': send it through lib/hook-refusal.mjs so a repeated refused call escalates';
const STRAY = ': deny only through refuse in lib/lazy-steps.mjs, on a guard-rules row with harm';

function findings(files, fixtures = REAL_FIXTURES) {
  const root = tempDir('hook-refusals-');
  for (const [name, text] of Object.entries({ ...files, [FIXTURES]: fixtures })) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  const results = [];
  checkHookRefusals({ result: (status, name, detail) => results.push({ status, detail }) }, createRepository(root));
  return results.filter(({ status }) => status === 'FAIL').map(({ detail }) => detail);
}

test('a hook that writes a deny straight to stdout is flagged', () => {
  const text = "const out = { hookSpecificOutput: { permissionDecision: 'deny' } };\nprocess.stdout.write(JSON.stringify(out));\n";
  assert.deepEqual(findings({ 'hooks/bad.mjs': text }), [`hooks/bad.mjs:2 writes hook output past writeHookOutput${ROUTE}`, `hooks/bad.mjs refuses without lib/hook-refusal.mjs${ROUTE}`, `hooks/bad.mjs writes a deny outside lib/lazy-steps.mjs${STRAY}`]);
});

test('a hook that blocks with exit code 2 is flagged', () => {
  const text = "import { writeHookOutput } from '../lib/hook-refusal.mjs';\nprocess.stderr.write('no');\nprocess.exitCode = 2;\n";
  assert.deepEqual(findings({ 'hooks/exit.mjs': text }), [`hooks/exit.mjs:3 blocks with exit code 2 past writeHookOutput${ROUTE}`]);
});

test('a hook that writes through the helper passes', () => {
  const text = "import { writeHookOutput } from '../lib/hook-refusal.mjs';\nwriteHookOutput({}, { decision: 'block', reason: 'x' }, 'good');\n";
  assert.deepEqual(findings({ 'hooks/good.mjs': text, 'lib/other.mjs': 'process.stdout.write("x");\n' }), []);
});

test('a deny written outside lib/lazy-steps.mjs is flagged and the run hooks are exempt', () => {
  const files = {
    'lib/bad.mjs': "export const f = () => ({ permissionDecision: 'deny' });\n",
    'lib/lazy-steps.mjs': "export const deny = () => ({ permissionDecision: 'deny' });\n",
    'hooks/run-no-wait.mjs': "import { writeHookOutput } from '../lib/hook-refusal.mjs';\nexport const f = () => ({ permissionDecision: 'deny' });\n"
  };
  assert.deepEqual(findings(files), [`lib/bad.mjs writes a deny outside lib/lazy-steps.mjs${STRAY}`]);
});

test('a denying row needs one pass and one deny fixture', () => {
  assert.deepEqual(findings({}), []);
  assert.ok(findings({}, '[]').some((finding) => finding.startsWith('stash lacks a pass fixture')));
});
