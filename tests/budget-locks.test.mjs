// The two always-on budgets are locked to measured values in verify/budgets.mjs:
// growth fails, shrinking passes, and neither check re-locks itself. The fixtures
// copy this repository's own skills/, because each lock is a fact about this
// corpus and a synthetic corpus would sit under any number.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { DESCRIPTION_TOTAL_LOCK, INJECTED_CONTEXT_LOCK } from '../verify/budgets.mjs';
import { checkDescriptionBudgets } from '../verify/checks/description-budgets.mjs';
import { checkInjectedContext } from '../verify/checks/injected-context.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const USING_EXO = 'skills/using-exo/SKILL.md';
// A 311-char description, so 50 more stays inside the 400-char per-skill limit
// and the total is what fails.
const COUNTED_SKILL = 'skills/research/SKILL.md';

// Both checks read nothing outside skills/, so the fixture copies that alone.
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

test('the untouched corpus sits at both locks', (t) => {
  const root = skillsFixture(t);

  const descriptions = verdict(root, checkDescriptionBudgets);
  const injected = verdict(root, checkInjectedContext);

  assert.equal(descriptions.counts.PASS, 1, descriptions.detail);
  assert.equal(injected.counts.PASS, 1, injected.detail);
  assert.match(descriptions.detail, new RegExp(`${DESCRIPTION_TOTAL_LOCK.chars} locked`));
  assert.match(injected.detail, new RegExp(`${INJECTED_CONTEXT_LOCK.bytes} locked`));
});

test('50 more chars in a counted description fail, naming the locked total and the new one', (t) => {
  const root = skillsFixture(t);
  editDescription(root, COUNTED_SKILL, (value) => `${'x'.repeat(50)}${value}`);

  const run = verdict(root, checkDescriptionBudgets);

  assert.equal(run.counts.FAIL, 1, run.detail);
  assert.match(run.detail, new RegExp(String(DESCRIPTION_TOTAL_LOCK.chars + 50)));
  assert.match(run.detail, new RegExp(`${DESCRIPTION_TOTAL_LOCK.chars} locked`));
});

test('50 fewer chars pass and the check re-locks nothing', (t) => {
  const root = skillsFixture(t);
  editDescription(root, COUNTED_SKILL, (value) => value.slice(0, value.length - 50));

  const run = verdict(root, checkDescriptionBudgets);

  assert.equal(run.counts.PASS, 1, run.detail);
  assert.match(run.detail, new RegExp(String(DESCRIPTION_TOTAL_LOCK.chars - 50)));
  assert.match(run.detail, new RegExp(`${DESCRIPTION_TOTAL_LOCK.chars} locked`));
});

test('a paragraph below the using-exo frontmatter fails the injected lock', (t) => {
  const root = skillsFixture(t);
  const paragraph = '\nEvery reply names the skill it followed.\n';
  fs.appendFileSync(path.join(root, USING_EXO), paragraph, 'utf8');

  const run = verdict(root, checkInjectedContext);

  assert.equal(run.counts.FAIL, 1, run.detail);
  assert.match(run.detail, new RegExp(`${INJECTED_CONTEXT_LOCK.bytes} locked`));
  const injected = Number(run.detail.match(/injects (\d+) bytes/)[1]);
  assert.equal(injected, INJECTED_CONTEXT_LOCK.bytes + paragraph.length);
});
