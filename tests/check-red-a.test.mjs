import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRepository } from '../verify/repository.mjs';
import { DESCRIPTION_CHARS } from '../verify/budgets.mjs';
import { derivedNames, checkDerivation } from '../verify/checks/derivation.mjs';
import { checkBannedText } from '../verify/checks/banned-text.mjs';
import { checkChangelogPlacement } from '../verify/checks/changelog-placement.mjs';
import { checkCodeComments } from '../verify/checks/code-comments.mjs';
import { checkCodexOverrides } from '../verify/checks/codex-overrides.mjs';
import { checkDescriptionBudgets } from '../verify/checks/description-budgets.mjs';
import { checkHarnessCapabilities } from '../verify/checks/harness-capabilities.mjs';

function recorder() {
  const results = [];
  const result = (...entry) => results.push({ status: entry[0], name: entry[1], detail: entry[2] });
  return {
    results,
    result,
    assert: (...entry) => result(entry[0] ? 'PASS' : 'FAIL', entry[1], entry[0] ? entry[2] : entry[3])
  };
}

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-check-red-'));
  for (const [relativePath, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), text);
  }
  return root;
}

function failures(check, root) {
  const report = recorder();
  check(report, createRepository(root));
  return report.results.filter((entry) => entry.status === 'FAIL');
}

function git(root, ...args) {
  const run = spawnSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
}

test('banned text fails on a vendor name in a skill', () => {
  const root = tree({ 'skills/x/SKILL.md': '---\nname: x\n---\nUse Claude Code here.\n' });
  const [failure] = failures(checkBannedText, root);
  assert.match(failure.detail, /vendor capability/);
});

test('changelog placement fails on a line added under a released heading', () => {
  const root = tree({ 'CHANGELOG.md': '# Log\n\n## Unreleased\n\n## 1.0.0\n\n- first\n' });
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'chore(release): 1.0.0');
  fs.appendFileSync(path.join(root, 'CHANGELOG.md'), '- late\n');
  const [failure] = failures(checkChangelogPlacement, root);
  assert.match(failure.detail, /under a released heading/);
});

test('code comments fails on a plain comment in lib', () => {
  const root = tree({ 'lib/a.mjs': '// explains the next line\nexport const a = 1;\n' });
  const [failure] = failures(checkCodeComments, root);
  assert.match(failure.detail, /lib\/a\.mjs:1 holds a comment/);
});

test('codex overrides fails on a tree the rules cannot generate', () => {
  const [failure] = failures(checkCodexOverrides, tree({ 'README.md': 'x\n' }));
  assert.equal(failure.name, 'codex overrides');
});

test('derivation fails on a derived name and on a notice file', () => {
  const root = tree({ 'notes.md': `see ${derivedNames()[0]}\n`, NOTICE: 'x\n' });
  const [failure] = failures(checkDerivation, root);
  assert.match(failure.detail, /derived name/);
  assert.match(failure.detail, /NOTICE exists/);
});

test('description budgets fails on a description over the ceiling', () => {
  const description = 'x'.repeat(DESCRIPTION_CHARS.ceiling + 1);
  const root = tree({ 'skills/x/SKILL.md': `---\nname: x\ndescription: ${description}\n---\nbody\n` });
  const [failure] = failures(checkDescriptionBudgets, root);
  assert.match(failure.detail, /description is \d+ chars/);
});

test('harness capabilities fails when the capability files are missing', () => {
  const [failure] = failures(checkHarnessCapabilities, tree({ 'README.md': 'x\n' }));
  assert.equal(failure.name, 'harness capabilities');
});
