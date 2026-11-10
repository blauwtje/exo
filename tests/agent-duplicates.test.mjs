import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { duplicateProblems, loadChains, SHARED_LINES_FILE } from '../verify/checks/agent-duplicates.mjs';
import { createRepository } from '../verify/repository.mjs';

const RULE = 'Never delete a file, container, volume, database, branch or credential to get past a blocked state.';

function root(allowed = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-agent-duplicates-'));
  fs.mkdirSync(path.join(directory, 'verify'));
  fs.writeFileSync(path.join(directory, SHARED_LINES_FILE), allowed);
  return directory;
}

const agent = (lines) => `---\nname: a\n---\n\n${lines.join('\n')}\n`;

test('a rule line copied into two agents fails and names both', () => {
  const problems = duplicateProblems(root(), [[['one.md', agent([`- ${RULE}`])], ['two.md', agent([RULE])]]]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /one\.md, two\.md: move it to one source/);
});

test('headings, fences and short lines are not rules', () => {
  const shared = ['## Report', '```', 'Return BLOCKED.'];
  assert.deepEqual(duplicateProblems(root(), [[['one.md', agent(shared)], ['two.md', agent(shared)]]]), []);
});

test('a listed shared line passes, and a listed line no longer shared fails', () => {
  const files = [[['one.md', agent([RULE])], ['two.md', agent([RULE])]]];
  assert.deepEqual(duplicateProblems(root(`${RULE}\n`), files), []);
  const problems = duplicateProblems(root(`${RULE}\n`), [[['one.md', agent([RULE])]]]);
  assert.match(problems.join(), /no longer shared: remove it/);
});

test('the same line in two separate chains is not a repeat', () => {
  const chains = [[['skills/a/SKILL.md', agent([RULE])]], [['skills/b/SKILL.md', agent([RULE])]]];
  assert.deepEqual(duplicateProblems(root(), chains), []);
});

test('this repository repeats no rule line inside one load chain beyond the list', () => {
  const repository = createRepository(path.resolve(import.meta.dirname, '..'));
  assert.deepEqual(duplicateProblems(repository.root, loadChains(repository)), []);
});
