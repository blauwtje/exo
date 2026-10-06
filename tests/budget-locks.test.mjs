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
import { AGENT_DESCRIPTION_TOTAL_LOCK, DESCRIPTION_CHARS, DESCRIPTION_TOTAL_LOCK, INJECTED_CONTEXT_LOCK, AGENT_BODY_TOKENS, REFERENCE_TOKEN_LOCKS } from '../verify/budgets.mjs';
import { checkAgentDescriptionBudgets, checkDescriptionBudgets } from '../verify/checks/description-budgets.mjs';
import { checkInjectedContext } from '../verify/checks/injected-context.mjs';
import { checkBodyBudgets } from '../verify/checks/body-budgets.mjs';
import { checkReferenceShape } from '../verify/checks/reference-shape.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const USING_EXO = 'skills/route-skills/SKILL.md';
// A counted description to shorten; growth goes to padding skills instead.
const COUNTED_SKILL = 'skills/check-docs/SKILL.md';

// Every check here reads nothing outside skills/, so the fixture copies that alone.
function skillsFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-budget-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(REPOSITORY_ROOT, 'skills'), path.join(root, 'skills'), { recursive: true });
  return root;
}

// checkBodyBudgets also reads agents/, so its fixture copies both.
function corpusFixture(t) {
  const root = skillsFixture(t);
  fs.cpSync(path.join(REPOSITORY_ROOT, 'agents'), path.join(root, 'agents'), { recursive: true });
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

// Adds `growth` counted chars as padding skills of at most DESCRIPTION_CHARS.ceiling each,
// so the per-skill cap never fires before the total, however far the corpus
// sits under its lock.
function growTotal(root, growth) {
  let remaining = growth;
  for (let index = 0; remaining > 0; index += 1) {
    const length = Math.min(remaining, DESCRIPTION_CHARS.ceiling);
    const folder = path.join(root, 'skills', `padding-${index}`);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'SKILL.md'), `---\nname: padding-${index}\ndescription: ${'x'.repeat(length)}\n---\n\n# Padding\n`, 'utf8');
    remaining -= length;
  }
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
  growTotal(root, growth);

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

test('a description at the per-skill ceiling passes and one char past it fails', (t) => {
  const root = skillsFixture(t);
  // A user-invoked skill stays out of the total, so only the per-skill cap can fire.
  editDescription(root, 'skills/remember/SKILL.md', () => `Use when ${'x'.repeat(DESCRIPTION_CHARS.ceiling - 9)}`);
  assert.equal(verdict(root, checkDescriptionBudgets).counts.PASS, 1);

  editDescription(root, 'skills/remember/SKILL.md', (value) => `${value}x`);
  const run = verdict(root, checkDescriptionBudgets);

  assert.equal(run.counts.FAIL, 1, run.detail);
  assert.match(run.detail, new RegExp(`${DESCRIPTION_CHARS.ceiling + 1} chars \\(> ${DESCRIPTION_CHARS.ceiling}\\)`));
});

test('a paragraph below the route-skills frontmatter fails the injected lock', (t) => {
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

// AGENT_BODY_TOKENS is a plain ceiling, not a two-way lock like
// DESCRIPTION_TOTAL_LOCK: a body under it passes at any distance and only
// growth past it fails, so these cases grow a non-exempt agent past the
// ceiling and shrink it back rather than measuring an exact locked value.
const NON_EXEMPT_AGENT = 'agents/locate-code.md';

test("an untouched agent body sits at or under AGENT_BODY_TOKENS.ceiling", (t) => {
  const root = corpusFixture(t);

  const run = verdict(root, checkBodyBudgets);

  assert.equal(run.counts.PASS, 1, run.detail);
});

test('filler pushed past AGENT_BODY_TOKENS.ceiling fails and names the ceiling', (t) => {
  const root = corpusFixture(t);
  const padding = '- A line no agent body has room for.\n'.repeat(150);
  fs.appendFileSync(path.join(root, NON_EXEMPT_AGENT), padding, 'utf8');

  const run = verdict(root, checkBodyBudgets);

  assert.equal(run.counts.FAIL, 1, run.detail);
  assert.match(run.detail, new RegExp(`${NON_EXEMPT_AGENT} body is \\d+ tokens, over its ${AGENT_BODY_TOKENS.ceiling}-token ceiling`));
});

test('shrinking the same agent body back below the ceiling passes again', (t) => {
  const root = corpusFixture(t);
  const padding = '- A line no agent body has room for.\n'.repeat(150);
  const file = path.join(root, NON_EXEMPT_AGENT);
  fs.appendFileSync(file, padding, 'utf8');
  assert.equal(verdict(root, checkBodyBudgets).counts.FAIL, 1, 'setup did not grow the body past the ceiling');
  const grown = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, grown.slice(0, grown.length - padding.length), 'utf8');

  const run = verdict(root, checkBodyBudgets);

  assert.equal(run.counts.PASS, 1, run.detail);
});

// REFERENCE_TOKEN_LOCKS is a two-way lock like DESCRIPTION_TOTAL_LOCK, not a
// plain ceiling: a locked file must land on its lock exactly, so growth past
// it and an unannounced shrink below it both fail.
const LOCKED_REFERENCE = 'skills/build/references/critique.md';

test('a locked reference at its exact lock passes', (t) => {
  const root = skillsFixture(t);

  const run = verdict(root, checkReferenceShape);

  assert.equal(run.counts.PASS, 1, run.detail);
});

test('growth past a reference lock fails and names the lock', (t) => {
  const root = skillsFixture(t);
  const file = path.join(root, LOCKED_REFERENCE);
  fs.appendFileSync(file, '- A line no locked reference has room for.\n', 'utf8');

  const run = verdict(root, checkReferenceShape);

  assert.equal(run.counts.FAIL, 1, run.detail);
  const lock = REFERENCE_TOKEN_LOCKS[LOCKED_REFERENCE];
  assert.match(run.detail, new RegExp(`${LOCKED_REFERENCE.replace(/\//g, '\\/')} is \\d+ tokens, over its ${lock}-token lock`));
});

test('an unannounced shrink below a reference lock also fails', (t) => {
  const root = skillsFixture(t);
  const file = path.join(root, LOCKED_REFERENCE);
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.slice(0, text.length - 40), 'utf8');

  const run = verdict(root, checkReferenceShape);

  assert.equal(run.counts.FAIL, 1, run.detail);
  const lock = REFERENCE_TOKEN_LOCKS[LOCKED_REFERENCE];
  assert.match(run.detail, new RegExp(`${LOCKED_REFERENCE.replace(/\//g, '\\/')} is \\d+ tokens, under its ${lock}-token lock`));
});

// AGENT_DESCRIPTION_TOTAL_LOCK works like DESCRIPTION_TOTAL_LOCK over agents/:
// growth past it fails, shrinking passes and re-locks nothing.
const COUNTED_AGENT = 'agents/build-task.md';

test('the untouched agents sit at or under the agent description lock', (t) => {
  const root = corpusFixture(t);

  const run = verdict(root, checkAgentDescriptionBudgets);

  assert.equal(run.counts.PASS, 1, run.detail);
  assert.match(run.detail, new RegExp(`${AGENT_DESCRIPTION_TOTAL_LOCK.chars} locked`));
});

test('50 agent description chars past the lock fail, naming the locked total and the new one', (t) => {
  const root = corpusFixture(t);
  const baseline = countedTotal(verdict(root, checkAgentDescriptionBudgets).detail);
  const growth = AGENT_DESCRIPTION_TOTAL_LOCK.chars - baseline + 50;
  editDescription(root, COUNTED_AGENT, (value) => `"${JSON.parse(value)}${'x'.repeat(growth)}"`);

  const run = verdict(root, checkAgentDescriptionBudgets);

  assert.equal(run.counts.FAIL, 1, run.detail);
  assert.equal(countedTotal(run.detail), AGENT_DESCRIPTION_TOTAL_LOCK.chars + 50, run.detail);
  assert.match(run.detail, new RegExp(`${AGENT_DESCRIPTION_TOTAL_LOCK.chars} locked`));
});

test('a shorter agent description passes and the check re-locks nothing', (t) => {
  const root = corpusFixture(t);
  const baseline = countedTotal(verdict(root, checkAgentDescriptionBudgets).detail);
  editDescription(root, COUNTED_AGENT, (value) => `"${JSON.parse(value).slice(0, -10)}"`);

  const run = verdict(root, checkAgentDescriptionBudgets);

  assert.equal(run.counts.PASS, 1, run.detail);
  assert.equal(countedTotal(run.detail), baseline - 10, run.detail);
  assert.match(run.detail, new RegExp(`${AGENT_DESCRIPTION_TOTAL_LOCK.chars} locked`));
});
