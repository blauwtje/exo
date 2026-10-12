// Only option A is ever recommended and no text opens a line with `Assuming:`;
// the check runs inside `npm run validate`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRepository } from '../verify/repository.mjs';
import { questionCapFindings, questionOptionFindings } from '../verify/checks/question-options.mjs';

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

test('a recommendation on B is no finding', (t) => {
  assert.deepEqual(findings(fixture(t, ['Recommended: (A), because fine', 'Recommended: (B), because fine'])), []);
});

test('options in order A, B, C are no finding', (t) => {
  assert.deepEqual(findings(fixture(t, ['- **(A) One**: x', '- **(B) Two**: y', '- **(C) Three**: z'])), []);
});

test('an option out of order is a finding at its line', (t) => {
  const root = fixture(t, ['- **(A) One**: x', '- **(C) Three**: z']);
  const total = fs.readFileSync(path.join(root, REFERENCE), 'utf8').split('\n').length - 1;
  assert.deepEqual(findings(root), [{ path: REFERENCE, line: total }]);
});

test('a list opening on B is a finding, and any other line resets the order', (t) => {
  assert.equal(findings(fixture(t, ['- **(B) Two**: y', '', '- **(A) One**: x', 'text', '- **(B) Two**: y'])).length, 2);
});

test('an Assuming: line is a finding, plain or bulleted', (t) => {
  assert.equal(findings(fixture(t, ['Assuming: the harbour', '- Assuming: the rest'])).length, 2);
});

test('a recommendation on A and the word assuming inside prose are no finding', (t) => {
  assert.deepEqual(findings(fixture(t, ['Recommended: (A), because fine', 'We stop assuming: nothing here.'])), []);
});

test('a (Recommended) tag is a finding', (t) => {
  assert.equal(findings(fixture(t, ['- **(A) Branch (Recommended)**: a new branch'])).length, 1);
});

const FENCE = '```';
const capFindings = (root) => questionCapFindings(createRepository(root));

test('this repository has no example question over a cap', () => {
  assert.deepEqual(questionCapFindings(createRepository(REPOSITORY_ROOT)), []);
});

test('an example question over the label cap is a finding at its line', (t) => {
  const root = fixture(t, [FENCE + 'text', '**Which way?**', '', '- **(A) One two three four**: fine', '', 'Recommended: (A), because fine.', FENCE]);
  const total = fs.readFileSync(path.join(root, REFERENCE), 'utf8').split('\n').length - 1;
  assert.deepEqual(capFindings(root), [{ path: REFERENCE, line: total - 3 }]);
});

test('an example question with a long title, two context sentences and a long reason is three findings', (t) => {
  const root = fixture(t, [FENCE, '**One two three four five six seven eight nine ten eleven?**', 'First. Second.', '', '- **(A) Go**: fine', '', 'Recommended: (A), because one two three four five six seven eight nine.', FENCE]);
  assert.equal(capFindings(root).length, 3);
});
