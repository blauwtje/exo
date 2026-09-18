// The budgets in verify/budgets.mjs are locked to measured values: growth
// fails, shrinking passes, and no check re-locks itself. The fixtures copy this
// repository's own skills/, because each lock is a fact about this corpus and a
// synthetic corpus would sit under any number.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { DESCRIPTION_TOTAL_LOCK, INJECTED_CONTEXT_LOCK, RESTATEMENT_LOCK } from '../verify/budgets.mjs';
import { checkDescriptionBudgets } from '../verify/checks/description-budgets.mjs';
import { checkInjectedContext } from '../verify/checks/injected-context.mjs';
import { checkRestatement } from '../verify/checks/restatement.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const USING_EXO = 'skills/using-exo/SKILL.md';
// A 311-char description, so 50 more stays inside the 400-char per-skill limit
// and the total is what fails.
const COUNTED_SKILL = 'skills/research/SKILL.md';

// Every check here reads nothing outside skills/, so the fixture copies that alone.
function skillsFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-budget-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(REPOSITORY_ROOT, 'skills'), path.join(root, 'skills'), { recursive: true });
  return root;
}

// createReport prints every detail through console.log and returns only counts,
// and the acceptance is about what the detail says, so the run is read back there.
function verdict(root, check) {
  const report = createReport();
  const printed = [];
  const log = console.log;
  console.log = (line) => printed.push(String(line));
  try {
    check(report, createRepository(root));
  } finally {
    console.log = log;
  }
  return { counts: report.counts(), detail: printed.join('\n') };
}

function editDescription(root, relative, rewrite) {
  const file = path.join(root, relative);
  const text = fs.readFileSync(file, 'utf8');
  const edited = text.replace(/^description: (.+)$/m, (whole, value) => `description: ${rewrite(value)}`);
  assert.notEqual(edited, text, `${relative} has no description line to edit`);
  fs.writeFileSync(file, edited, 'utf8');
}

// A lock may sit above the corpus: shrinking passes and re-locks nothing, so a
// later trim leaves the measured value below the locked one. Every case
// therefore measures the untouched fixture and grows it to a fixed distance past
// the lock, instead of assuming the two are still equal.
function countedTotal(detail) {
  const measured = detail.match(/total (?:is )?(\d+) chars/);
  assert.ok(measured, `no counted description total in: ${detail}`);
  return Number(measured[1]);
}

function injectedBytes(detail) {
  const measured = detail.match(/injects (\d+) bytes/);
  assert.ok(measured, `no injected byte count in: ${detail}`);
  return Number(measured[1]);
}

test('the untouched corpus sits at or under both locks', (t) => {
  const root = skillsFixture(t);

  const descriptions = verdict(root, checkDescriptionBudgets);
  const injected = verdict(root, checkInjectedContext);

  assert.equal(descriptions.counts.PASS, 1, descriptions.detail);
  assert.equal(injected.counts.PASS, 1, injected.detail);
  assert.match(descriptions.detail, new RegExp(`${DESCRIPTION_TOTAL_LOCK.chars} locked`));
  assert.match(injected.detail, new RegExp(`${INJECTED_CONTEXT_LOCK.bytes} locked`));
});

test('50 chars past the locked total fail, naming the locked total and the new one', (t) => {
  const root = skillsFixture(t);
  const baseline = countedTotal(verdict(root, checkDescriptionBudgets).detail);
  const growth = DESCRIPTION_TOTAL_LOCK.chars - baseline + 50;
  editDescription(root, COUNTED_SKILL, (value) => `${'x'.repeat(growth)}${value}`);

  const run = verdict(root, checkDescriptionBudgets);

  assert.equal(run.counts.FAIL, 1, run.detail);
  assert.equal(countedTotal(run.detail), DESCRIPTION_TOTAL_LOCK.chars + 50, run.detail);
  assert.match(run.detail, new RegExp(`${DESCRIPTION_TOTAL_LOCK.chars} locked`));
});

test('50 fewer chars pass and the check re-locks nothing', (t) => {
  const root = skillsFixture(t);
  const baseline = countedTotal(verdict(root, checkDescriptionBudgets).detail);
  editDescription(root, COUNTED_SKILL, (value) => value.slice(0, value.length - 50));

  const run = verdict(root, checkDescriptionBudgets);

  assert.equal(run.counts.PASS, 1, run.detail);
  assert.equal(countedTotal(run.detail), baseline - 50, run.detail);
  assert.match(run.detail, new RegExp(`${DESCRIPTION_TOTAL_LOCK.chars} locked`));
});

test('a paragraph below the using-exo frontmatter fails the injected lock', (t) => {
  const root = skillsFixture(t);
  const baseline = injectedBytes(verdict(root, checkInjectedContext).detail);
  const padding = 'x'.repeat(INJECTED_CONTEXT_LOCK.bytes - baseline);
  const paragraph = `\n${padding}Every reply names the skill it followed.\n`;
  fs.appendFileSync(path.join(root, USING_EXO), paragraph, 'utf8');

  const run = verdict(root, checkInjectedContext);

  assert.equal(run.counts.FAIL, 1, run.detail);
  assert.match(run.detail, new RegExp(`${INJECTED_CONTEXT_LOCK.bytes} locked`));
  assert.equal(injectedBytes(run.detail), baseline + paragraph.length, run.detail);
});

function restatedBytes(detail) {
  const measured = detail.match(/restates (\d+) bytes/);
  assert.ok(measured, `no restated byte count in: ${detail}`);
  return Number(measured[1]);
}

function editUsingExo(root, rewrite) {
  const file = path.join(root, USING_EXO);
  const text = fs.readFileSync(file, 'utf8');
  const edited = rewrite(text);
  assert.notEqual(edited, text, `${USING_EXO} did not change`);
  fs.writeFileSync(file, edited, 'utf8');
}

test('the untouched restatement sits at or under its lock', (t) => {
  const root = skillsFixture(t);

  const run = verdict(root, checkRestatement);

  assert.equal(run.counts.PASS, 1, run.detail);
  assert.match(run.detail, new RegExp(`${RESTATEMENT_LOCK.bytes} locked`));
});

test('a sentence added to a restated section fails the restatement lock', (t) => {
  const root = skillsFixture(t);
  const baseline = restatedBytes(verdict(root, checkRestatement).detail);
  const padding = 'x'.repeat(RESTATEMENT_LOCK.bytes - baseline);
  const paragraph = `${padding}Every reply names the skill it followed.\n\n`;
  editUsingExo(root, (text) => text.replace('## When several fire\n\n', `## When several fire\n\n${paragraph}`));

  const run = verdict(root, checkRestatement);

  assert.equal(run.counts.FAIL, 1, run.detail);
  assert.match(run.detail, new RegExp(`${RESTATEMENT_LOCK.bytes} locked`));
  assert.equal(restatedBytes(run.detail), baseline + paragraph.length, run.detail);
});

test('a sentence added outside the restated sections leaves the restatement lock alone', (t) => {
  const root = skillsFixture(t);
  const baseline = restatedBytes(verdict(root, checkRestatement).detail);
  editUsingExo(root, (text) => text.replace('## The ladder\n\n', '## The ladder\n\nEvery reply names the skill it followed.\n\n'));

  const run = verdict(root, checkRestatement);

  assert.equal(run.counts.PASS, 1, run.detail);
  assert.equal(restatedBytes(run.detail), baseline, run.detail);
});

test('a renamed restated heading fails and names the heading', (t) => {
  const root = skillsFixture(t);
  // The skill body also names this heading in prose, so only the line that is
  // the heading is renamed here.
  editUsingExo(root, (text) => text.replace('\n## The next stage\n', '\n## Next stage\n'));

  const run = verdict(root, checkRestatement);

  assert.equal(run.counts.FAIL, 1, run.detail);
  assert.match(run.detail, /has no "## The next stage" heading/);
});
