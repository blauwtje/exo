import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRepository } from '../verify/repository.mjs';
import { checkLoopKinds } from '../verify/checks/loop-kinds.mjs';

const KINDS = { proof: { cap: 3, progress: 'failing proof tests', owner: 'skills/build/scripts/land-proof.mjs' } };

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-loop-kinds-'));
  const all = { 'skills/.keep': '', 'lib/loop-kinds.json': JSON.stringify(KINDS), ...files };
  for (const [name, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

function detail(files) {
  const messages = [];
  const report = { assert: (ok, ...texts) => messages.push(ok ? '' : texts.at(-1)) };
  checkLoopKinds(report, createRepository(fixture(files)));
  return messages.join('');
}

const CLEAN = {
  'skills/build/scripts/land-proof.mjs': "roundCap('proof');\n",
  'tests/land-proof.test.mjs': "// land-proof.mjs\nconst kind = 'proof';\n"
};

test('a fixture with a consumer and a test passes', () => {
  assert.doesNotMatch(detail(CLEAN), /numeric cap|names no loop kind|owner|no test/);
});

test('a numeric retry cap outside the kinds table fails', () => {
  assert.match(detail({ ...CLEAN, 'hooks/a.mjs': 'const MAX_RETRIES = 4;\n' }), /numeric cap literal/);
});

test('camelCase and upper-case cap literals fail', () => {
  for (const line of ['const maxAttempts = 3;', 'let repairBound = 2;', 'const attemptCap = 5;', 'const MAX_ATTEMPTS = 3;', 'const maxRounds = 4;']) {
    assert.match(detail({ ...CLEAN, 'hooks/a.mjs': `${line}\n` }), /numeric cap literal/, line);
  }
  assert.doesNotMatch(detail({ ...CLEAN, 'hooks/a.mjs': 'const retryDelayMs = 50;\nlet round = 1;\n' }), /numeric cap literal/);
});

test('a kind its owner never reads fails and a missing table fails', () => {
  assert.match(detail({ ...CLEAN, 'skills/build/scripts/land-proof.mjs': 'export const x = 1;\n' }), /never reads it/);
  const messages = [];
  const root = fixture({});
  fs.rmSync(path.join(root, 'lib', 'loop-kinds.json'));
  checkLoopKinds({ assert: (ok, ...texts) => messages.push(ok ? '' : texts.at(-1)) }, createRepository(root));
  assert.match(messages.join(''), /missing/);
});

test('rerun prose without a kind fails and with a kind passes', () => {
  const bad = detail({ ...CLEAN, 'agents/a.md': '---\nname: a\n---\nRerun it once per edit.\n' });
  assert.match(bad, /names no loop kind/);
  const good = detail({ ...CLEAN, 'agents/a.md': '---\nname: a\n---\nRerun once per edit (kind `proof`).\n' });
  assert.doesNotMatch(good, /names no loop kind/);
});

test('a kind with no owner script or no test fails', () => {
  assert.match(detail({ 'tests/a.test.mjs': '' }), /owner skills\/build\/scripts\/land-proof.mjs does not exist/);
  assert.match(detail({ 'skills/build/scripts/land-proof.mjs': "roundCap('proof');" }), /no test of .* names it/);
});

test('a rule module chaining denials with ?? fails', () => {
  const chain = 'const out = roleFields(a) ?? mismatchFields(a);\n';
  assert.match(detail({ ...CLEAN, 'hooks/h.mjs': chain }), /return only the first violation/);
});

test('the real kinds table names review-fix and provider with a cap', async () => {
  const { roundCap } = await import('../lib/loop-budget.mjs');
  assert.equal(roundCap('review-fix'), 3);
  assert.equal(roundCap('provider'), 3);
});
