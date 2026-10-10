// A skill body line naming a paid run carries the user's request in the same
// line; the check runs inside `npm run validate`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRepository } from '../verify/repository.mjs';
import { paidRunFindings } from '../verify/checks/paid-runs.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const REFERENCE = 'skills/route-skills/references/question.md';

function fixture(t, lines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-paid-runs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(REPOSITORY_ROOT, 'skills'), path.join(root, 'skills'), { recursive: true });
  fs.appendFileSync(path.join(root, REFERENCE), `\n${lines.join('\n')}\n`);
  return root;
}

const findings = (root) => paidRunFindings(createRepository(root));

test('this repository has no paid run without the user\'s request', () => {
  assert.deepEqual(paidRunFindings(createRepository(REPOSITORY_ROOT)), []);
});

test('a line naming a paid run without a trigger is a finding at its line', (t) => {
  const root = fixture(t, ['Run `scripts/pressure.mjs` on every case.']);
  const total = fs.readFileSync(path.join(root, REFERENCE), 'utf8').split('\n').length - 1;
  assert.deepEqual(findings(root), [{ path: REFERENCE, line: total }]);
});

test('each of the three paid runs is a finding', (t) => {
  assert.equal(findings(fixture(t, ['Run `claude -p` now.', 'Run benchmarks/run.mjs now.'])).length, 2);
});

test('the same line naming the user\'s request is no finding', (t) => {
  assert.deepEqual(findings(fixture(t, ['The user asks for a run → run `claude -p` once.'])), []);
});
