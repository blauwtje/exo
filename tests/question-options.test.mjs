// Only option A is ever recommended and no text opens a line with `Assuming:`;
// the check runs inside `npm run validate`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRepository } from '../verify/repository.mjs';
import { questionOptionFindings } from '../verify/checks/question-options.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const REFERENCE = 'skills/route-skills/references/question.md';

function fixture(t, lines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-question-options-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(REPOSITORY_ROOT, 'skills'), path.join(root, 'skills'), { recursive: true });
  fs.appendFileSync(path.join(root, REFERENCE), `\n${lines.join('\n')}\n`);
  return root;
}

const findings = (root) => questionOptionFindings(createRepository(root));

test('this repository has no recommendation off A and no Assuming: line', () => {
  assert.deepEqual(questionOptionFindings(createRepository(REPOSITORY_ROOT)), []);
});

test('a recommendation on B is a finding at its line', (t) => {
  const root = fixture(t, ['→ A. fine', '→ B. wrong']);
  const total = fs.readFileSync(path.join(root, REFERENCE), 'utf8').split('\n').length - 1;
  assert.deepEqual(findings(root), [{ path: REFERENCE, line: total }]);
});

test('an indented recommendation off A is a finding', (t) => {
  assert.equal(findings(fixture(t, ['  → C. wrong'])).length, 1);
});

test('an Assuming: line is a finding, plain or bulleted', (t) => {
  assert.equal(findings(fixture(t, ['Assuming: the harbour', '- Assuming: the rest'])).length, 2);
});

test('a recommendation on A and the word assuming inside prose are no finding', (t) => {
  assert.deepEqual(findings(fixture(t, ['→ A. fine', 'We stop assuming: nothing here.'])), []);
});
