import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const SKILL = new URL('../skills/find-cause/SKILL.md', import.meta.url);
const INVESTIGATOR = new URL('../skills/find-cause/investigator-prompt.md', import.meta.url);
const FIXER = new URL('../skills/find-cause/fixer-prompt.md', import.meta.url);
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

test('reference-tables.mjs owner rows list both prompt files for find-cause', () => {
  const source = fs.readFileSync(REFERENCE_TABLES, 'utf8');
  const debugRows = source.match(/'skills\/find-cause\/SKILL\.md': \[([\s\S]*?)\],/);
  assert.ok(debugRows, 'reference-tables.mjs has a find-cause owner-rows entry');
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

test('references/handoff.md states the 25-line cap and every D1 field, and SKILL.md routes to it', () => {
  const references = fs.readFileSync(SKILL, 'utf8').match(/## References\n([\s\S]*?)(\n## |\nReport:)/);
  assert.ok(references, 'SKILL.md has a ## References table');
  assert.ok(references[1].includes('`references/handoff.md`'), 'the References table names references/handoff.md');
  const body = fs.readFileSync(new URL('../skills/find-cause/references/handoff.md', import.meta.url), 'utf8');
  assert.ok(body.includes('at most 25 lines'), 'states the 25-line cap');
  for (const field of HANDOFF_FIELDS) {
    assert.ok(body.includes(`\`${field}\``), `handoff.md names ${field}`);
  }
});

test('Step 7 runs pick-reviewer.mjs --effort and drops the hardcoded thresholds', () => {
  const source = fs.readFileSync(SKILL, 'utf8');
  assert.ok(
    source.includes('node "${CLAUDE_SKILL_DIR}/../run-plan/scripts/pick-reviewer.mjs" --effort'),
    'Step 7 runs pick-reviewer.mjs --effort',
  );
  assert.ok(source.includes('`skip`'), 'Step 7 names skip');
  assert.ok(source.includes('`low`'), 'Step 7 names low');
  assert.ok(source.includes('`medium`'), 'Step 7 names medium');
  assert.ok(!source.includes('five changed files'), 'Step 7 no longer hardcodes five changed files');
  assert.ok(!source.includes('200 changed lines'), 'Step 7 no longer hardcodes 200 changed lines');
});
