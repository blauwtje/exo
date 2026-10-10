// The every-session load is locked at SESSION_LOAD_LOCK words: the real corpus
// passes, and a corpus grown past the lock fails. The fixture copies the folders
// the hook and the check read, because the lock is a fact about this corpus.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { SESSION_LOAD_LOCK } from '../verify/budgets.mjs';
import { checkSessionLoad } from '../verify/checks/session-load.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-session-load-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const entry of ['skills', 'agents', 'hooks', 'lib', 'harnesses', 'verify', 'package.json']) {
    fs.cpSync(path.join(REPOSITORY_ROOT, entry), path.join(root, entry), { recursive: true });
  }
  return root;
}

function verdict(root) {
  const report = createReport();
  const printed = [];
  const log = console.log;
  console.log = (line) => printed.push(String(line));
  try {
    checkSessionLoad(report, createRepository(root));
  } finally {
    console.log = log;
  }
  return { counts: report.counts(), detail: printed.join('\n') };
}

test('the lock is 598 words', () => {
  assert.equal(SESSION_LOAD_LOCK.words, 598);
});

test('this corpus loads within the lock', () => {
  const { counts, detail } = verdict(REPOSITORY_ROOT);
  assert.equal(counts.FAIL, 0, detail);
  assert.equal(counts.UNRUN, 0, detail);
  assert.equal(counts.PASS, 1, detail);
});

test('a model-invocable skill past the lock fails and names the count', (t) => {
  const root = fixture(t);
  const folder = path.join(root, 'skills', 'padding');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'SKILL.md'), `---\nname: padding\ndescription: ${'word '.repeat(SESSION_LOAD_LOCK.words)}\n---\n\n# Padding\n`, 'utf8');
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL, 1, detail);
  assert.match(detail, new RegExp(`every session loads \\d+ words .* over the ${SESSION_LOAD_LOCK.words} locked`));
});

test('a skill that is not model-invocable adds nothing', (t) => {
  const root = fixture(t);
  const folder = path.join(root, 'skills', 'padding');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'SKILL.md'), `---\nname: padding\ndescription: ${'word '.repeat(SESSION_LOAD_LOCK.words)}\ndisable-model-invocation: true\n---\n\n# Padding\n`, 'utf8');
  const { counts, detail } = verdict(root);
  assert.equal(counts.FAIL, 0, detail);
});
