import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const SKILL = new URL('../skills/debug/SKILL.md', import.meta.url);
const INVESTIGATOR = new URL('../skills/debug/investigator-prompt.md', import.meta.url);
const FIXER = new URL('../skills/debug/fixer-prompt.md', import.meta.url);
const REFERENCE_TABLES = new URL('../verify/checks/reference-tables.mjs', import.meta.url);

const HANDOFF_FIELDS = [
  'Symptom',
  'Repro',
  'Expected',
  'Actual',
  'Log',
  'Hypotheses',
  'Cause',
  'Mechanism',
  'Prediction',
  'Ranges',
  'Status',
];

test('SKILL.md names the handoff directory', () => {
  const source = fs.readFileSync(SKILL, 'utf8');
  assert.ok(source.includes('exo/debug/'), 'SKILL.md names exo/debug/');
});

test('both prompt files exist', () => {
  assert.ok(fs.existsSync(INVESTIGATOR), 'investigator-prompt.md exists');
  assert.ok(fs.existsSync(FIXER), 'fixer-prompt.md exists');
});

test('SKILL.md reference table lists both prompt files', () => {
  const source = fs.readFileSync(SKILL, 'utf8');
  assert.ok(source.includes('`investigator-prompt.md`'), 'table lists investigator-prompt.md');
  assert.ok(source.includes('`fixer-prompt.md`'), 'table lists fixer-prompt.md');
});

test('reference-tables.mjs owner rows list both prompt files for debug', () => {
  const source = fs.readFileSync(REFERENCE_TABLES, 'utf8');
  const debugRows = source.match(/'skills\/debug\/SKILL\.md': \[([\s\S]*?)\],/);
  assert.ok(debugRows, 'reference-tables.mjs has a debug owner-rows entry');
  assert.ok(debugRows[1].includes('investigator-prompt.md'));
  assert.ok(debugRows[1].includes('fixer-prompt.md'));
});

test('investigator prompt names opus and Steps 1-3', () => {
  const source = fs.readFileSync(INVESTIGATOR, 'utf8');
  assert.ok(source.includes('opus'), 'names opus');
  assert.ok(source.includes('Steps 1 to 3'), 'names Steps 1 to 3');
});

test('fixer prompt names sonnet, Steps 4-6 and the handoff path', () => {
  const source = fs.readFileSync(FIXER, 'utf8');
  assert.ok(source.includes('sonnet'), 'names sonnet');
  assert.ok(source.includes('Steps 4 to 6'), 'names Steps 4 to 6');
  assert.ok(source.includes('Handoff file:'), 'names the handoff path');
});

test("SKILL.md's Handoff section states the 25-line cap and every D1 field", () => {
  const source = fs.readFileSync(SKILL, 'utf8');
  const handoffSection = source.match(/## Handoff\n([\s\S]*?)\n## References/);
  assert.ok(handoffSection, 'SKILL.md has a ## Handoff section');
  const body = handoffSection[1];
  assert.ok(body.includes('25 lines'), 'states the 25-line cap');
  for (const field of HANDOFF_FIELDS) {
    assert.ok(body.includes(`\`${field}\``), `Handoff section names ${field}`);
  }
});

test('Step 7 runs pick-reviewer.mjs --effort and drops the hardcoded thresholds', () => {
  const source = fs.readFileSync(SKILL, 'utf8');
  assert.ok(
    source.includes('node "${CLAUDE_SKILL_DIR}/../implementing/scripts/pick-reviewer.mjs" --effort'),
    'Step 7 runs pick-reviewer.mjs --effort',
  );
  assert.ok(source.includes('`skip`'), 'Step 7 names skip');
  assert.ok(source.includes('`low`'), 'Step 7 names low');
  assert.ok(source.includes('`medium`'), 'Step 7 names medium');
  assert.ok(!source.includes('five changed files'), 'Step 7 no longer hardcodes five changed files');
  assert.ok(!source.includes('200 changed lines'), 'Step 7 no longer hardcodes 200 changed lines');
});
