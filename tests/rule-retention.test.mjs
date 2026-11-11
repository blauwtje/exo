import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkRuleRetention, lineHash, removedRuleLines } from '../verify/checks/rule-retention.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { commitFiles, git, gitRepository } from './harness.mjs';

const RULE = 'Never run the full suite more than twice per task, because each run costs 90 seconds.';
const SEED = {
  'skills/build/SKILL.md': `# Build\n\n${RULE}\nPlain sentence about layout.\n`,
  'skills/build/references/notes.md': '# Notes\n\nSome other text.\n'
};

async function branchFixture() {
  const root = await gitRepository(SEED);
  git(root, 'switch', '-q', '-c', 'feat');
  return root;
}

function outcome(root, options) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  const report = createReport();
  try {
    checkRuleRetention(report, createRepository(root), options);
  } finally {
    console.log = original;
  }
  return { counts: report.counts(), lines };
}

test('a rule removed from a skill file fails and names the file and line', async () => {
  const root = await branchFixture();
  await commitFiles(root, { 'skills/build/SKILL.md': '# Build\n\nPlain sentence about layout.\n' }, 'docs: trim');
  const { counts, lines } = outcome(root);
  assert.equal(counts.FAIL, 1);
  assert.match(lines[0], /skills\/build\/SKILL\.md/);
  assert.match(lines[0], /Never run the full suite/);
});

test('a rule moved to another skills file passes', async () => {
  const root = await branchFixture();
  await commitFiles(root, {
    'skills/build/SKILL.md': '# Build\n\nPlain sentence about layout.\n',
    'skills/build/references/notes.md': `# Notes\n\n- ${RULE}\n`
  }, 'docs: move');
  const { counts } = outcome(root);
  assert.equal(counts.FAIL, 0);
  assert.equal(counts.PASS, 1);
});

test('a rule kept in a hooks file passes', async () => {
  const root = await branchFixture();
  await commitFiles(root, {
    'skills/build/SKILL.md': '# Build\n\nPlain sentence about layout.\n',
    'hooks/rules.md': `${RULE}\n`
  }, 'docs: move to hooks');
  assert.equal(outcome(root).counts.FAIL, 0);
});

test('an uncommitted removal is checked too', async () => {
  const root = await branchFixture();
  await fs.writeFile(path.join(root, 'skills/build/SKILL.md'), '# Build\n');
  assert.equal(outcome(root).counts.FAIL, 1);
});

test('an allowlisted removal passes', async () => {
  const root = await branchFixture();
  await commitFiles(root, {
    'skills/build/SKILL.md': '# Build\n\nPlain sentence about layout.\n',
    'verify/rule-removals.txt': `${lineHash(RULE).slice(0, 12)} the suite budget moved to the gate\n`
  }, 'docs: trim with reason');
  assert.equal(outcome(root).counts.FAIL, 0);
});

test('a removal without a rule marker passes silently', async () => {
  const root = await branchFixture();
  await commitFiles(root, { 'skills/build/SKILL.md': `# Build\n\n${RULE}\n` }, 'docs: drop the plain line');
  const { counts, lines } = outcome(root);
  assert.equal(counts.FAIL, 0);
  assert.deepEqual(lines, []);
});

test('a clean default branch is silent', async () => {
  const root = await gitRepository(SEED);
  const { counts, lines } = outcome(root);
  assert.deepEqual(counts, { PASS: 0, FAIL: 0, WARN: 0, UNRUN: 0 });
  assert.deepEqual(lines, []);
});

test('an explicit base reports a rule lost since that revision', async () => {
  const root = await gitRepository(SEED);
  const base = String(git(root, 'rev-parse', 'HEAD')).trim();
  await commitFiles(root, { 'skills/build/SKILL.md': '# Build\n' }, 'docs: trim');
  assert.equal(outcome(root, { base }).counts.FAIL, 1);
});

test('a folder with no git and a repository with no default branch are silent', async () => {
  const root = await gitRepository(SEED);
  git(root, 'branch', '-m', 'trunk');
  await fs.writeFile(path.join(root, 'skills/build/SKILL.md'), '# Build\n');
  assert.deepEqual(outcome(root).lines, []);
  const plain = await fs.mkdtemp(path.join(process.env.TMPDIR ?? '/tmp', 'rule-retention-'));
  await fs.mkdir(path.join(plain, 'skills'));
  assert.deepEqual(outcome(plain).lines, []);
});

test('removedRuleLines splits sentences and reads only checked files', () => {
  const diff = [
    'diff --git a/skills/a/SKILL.md b/skills/a/SKILL.md',
    '--- a/skills/a/SKILL.md',
    '+++ b/skills/a/SKILL.md',
    '@@ -1,2 +1,0 @@',
    '-Plain words. Never skip the gate.',
    '--- a dash line, plain',
    'diff --git a/README.md b/README.md',
    '@@ -1 +0,0 @@',
    '-Never edit this.'
  ].join('\n');
  assert.deepEqual(removedRuleLines(diff), [{ file: 'skills/a/SKILL.md', text: 'Never skip the gate.' }]);
});

test('a rule kept in lib/references or agents passes', async () => {
  for (const kept of ['lib/references/rules.md', 'agents/worker.md']) {
    const root = await branchFixture();
    await commitFiles(root, {
      'skills/build/SKILL.md': '# Build\n\nPlain sentence about layout.\n',
      [kept]: `${RULE}\n`
    }, 'docs: move');
    assert.equal(outcome(root).counts.FAIL, 0);
  }
});

test('the gate help names only the Guard: line a fixer commit needs', async () => {
  const help = await fs.readFile(path.resolve(import.meta.dirname, '../skills/gate/scripts/gate.mjs'), 'utf8');
  assert.doesNotMatch(help, /lacks Sweep:/);
});
