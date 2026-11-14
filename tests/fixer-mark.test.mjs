import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { findingsDigest } from '../lib/fixer-mark.mjs';

const PROMPT = fs.readFileSync(new URL('../skills/build/review-fixer-prompt.md', import.meta.url), 'utf8');

const MERGED = [
  'lib/context-limits.mjs:116-118; concern; plan fit (Decisions 5, 6); the soft note lacks the manager subagent; fix',
  '  Probe: grep -c "manager subagent" lib/context-limits.mjs',
  '  Class: plan fit',
  '  Sweep: grep -L "manager subagent" lib/context-limits.mjs',
  'hooks/agent-effort.mjs:26-34; concern; plan Decision 18; an unknown label gets no deny and no model; report',
  'tests/context-limit.test.mjs:47; defect; removed assertion; `assert.match(soft.additionalContext, /exo:save-session/);`; report',
  'hooks/task-runner.md:29; concern; plan fit; a red Proof goes to SendMessage first; report',
  ''
].join('\n');

const FIXER_WRITTEN = [
  'lib/context-limits.mjs:116-118; concern; plan fit (Decisions 5, 6); the soft note lacks the manager subagent; fix | fixed',
  '  Probe: grep -c "manager subagent" lib/context-limits.mjs',
  '  Class: plan fit',
  '  Sweep: grep -L "manager subagent" lib/context-limits.mjs',
  'hooks/agent-effort.mjs:26-34; concern; plan Decision 18; an unknown label gets no deny and no model; report | reported: already absent',
  'tests/context-limit.test.mjs:47; defect; removed assertion; `assert.match(soft.additionalContext, /exo:save-session/);`; report | reported: defect with action report, left unchanged',
  'hooks/task-runner.md:29; concern; plan fit; a red Proof goes to SendMessage first; report | reported: unproven',
  ''
].join('\n');

function promptExamples() {
  const rule = PROMPT.split('\n').find((line) => line.includes('| fixed`')) ?? '';
  return [...rule.matchAll(/`([^`]+:\d[^`]*)`/g)].map((match) => match[1]);
}

test('the fixer prompt shows a marked finding line', () => {
  assert.ok(promptExamples().length >= 2, 'the Append rule shows a fixed and a reported example line');
});

test('findingsDigest strips each mark the fixer prompt shows', () => {
  for (const marked of promptExamples()) {
    const merged = marked.replace(/ \| (?:fixed|reported: .*)$/, '');
    assert.notEqual(merged, marked, marked);
    assert.equal(findingsDigest(`${marked}\n`), findingsDigest(`${merged}\n`), marked);
  }
});

test('the fixer agent sends a defect already absent to reported, not fixed', () => {
  const agent = fs.readFileSync(new URL('../lib/agent-modes/task-modes.md', import.meta.url), 'utf8');
  assert.match(agent, /no longer has the finding's defect, make no edit and write `reported: already absent`, not `fixed`/);
});

test('findingsDigest of a fixer-written file equals the merged file', () => {
  assert.equal(findingsDigest(FIXER_WRITTEN), findingsDigest(MERGED));
});

test('the fixer prompt shows each Guard form as its own line, not alternatives joined by a bar', () => {
  const forms = [...PROMPT.matchAll(/`(Guard: [^`]*)`/g)].map((match) => match[1]);
  assert.deepEqual(forms, ['Guard: <file>', 'Guard: none (<reason>)']);
});

test('findingsDigest is unchanged when a mark replaces the action word', () => {
  const replaced = FIXER_WRITTEN.replaceAll('; fix | fixed', '; fixed').replaceAll('; report | reported:', '; reported:');
  assert.equal(findingsDigest(replaced), findingsDigest(MERGED));
});
