import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stopOutput } from './proof-check.mjs';

const BUILD_CALL = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', id: 'toolu_skill', input: { skill: 'build' } }] } };

function reportRow(text) {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] } };
}

// The four report shapes of issue #94: a build turn that changes no code.
function reportOutput(reportText, { afterTypedTurn = false } = {}) {
  return stopFor([BUILD_CALL, ...(afterTypedTurn ? [{ type: 'user', message: { content: 'git pull' } }] : []), reportRow(reportText)]);
}

function stopFor(rows) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proof-check-94-')), 'transcript.jsonl');
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  return stopOutput({ transcript_path: file });
}

test('#94: a plain Unverified line without a Done claim passes', () => {
  assert.equal(reportOutput('Pulled 3 commits, main up to date.\nUnverified: no exo checks run; git pull changes no code.'), '');
});

test('#94: a bold Unverified label without a Done claim passes', () => {
  assert.equal(reportOutput('Pulled 3 commits, main up to date.\n**Unverified:** no exo checks run; git pull changes no code.'), '');
});

test('#94: a bulleted Unverified line without a Done claim passes', () => {
  assert.equal(reportOutput('Pulled 3 commits, main up to date.\n- Unverified: no checks run.'), '');
});

test('#94: a report with no Proof and no Unverified line never says it claims Done', () => {
  const result = JSON.parse(reportOutput('Pulled 3 commits.'));
  assert.equal(result.decision, 'block');
  assert.doesNotMatch(result.reason, /claims Done/);
  assert.match(result.reason, /Unverified/);
});

test('#94: a Done report with no Proof line still names the Done claim', () => {
  const result = JSON.parse(reportOutput('**Done:** pulled 3 commits.'));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /claims Done/);
});

test('#94: the four report shapes on a later typed turn that never called build pass', () => {
  const reports = [
    'Pulled 3 commits.\nUnverified: no exo checks run; git pull changes no code.',
    'Pulled 3 commits.\n**Unverified:** no exo checks run; git pull changes no code.',
    'Pulled 3 commits.\n- Unverified: no checks run.',
    'Pulled 3 commits.'
  ];
  for (const report of reports) assert.equal(reportOutput(report, { afterTypedTurn: true }), '');
});

const EDIT = ['Edit', { file_path: '/repo/src/title-case.js' }];
const GREEN_TESTS = 'ℹ pass 5\nℹ fail 0';
const FAILED_TESTS = 'Exit code 1\nℹ pass 4\nℹ fail 1';

function bash(command, result, isError = false) {
  return ['Bash', { command }, result, isError];
}

// A build turn of tool calls, each [name, input, result, isError], ending on reportText.
function turnOutput(calls, reportText) {
  const rows = [BUILD_CALL];
  calls.forEach(([name, input, result, isError], index) => {
    rows.push({ type: 'assistant', message: { content: [{ type: 'tool_use', name, id: `toolu_${index}`, input }] } });
    if (result !== undefined) rows.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `toolu_${index}`, content: result, is_error: isError }] } });
  });
  return stopFor([...rows, reportRow(reportText)]);
}

test('a green test run after the last edit backs a Done report with no Proof line', () => {
  assert.equal(turnOutput([EDIT, bash('npm test', GREEN_TESTS)], '**Done:** titleCase handles mixed case.'), '');
});

test('a Done report blocks when an edit follows its last green run', () => {
  const result = JSON.parse(turnOutput([bash('npm test', GREEN_TESTS), EDIT], '**Done:** titleCase handles mixed case.\nProof: npm test -> ℹ pass 5'));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /after the last edit/);
});

test('a Proof quote its run contradicts blocks', () => {
  const result = JSON.parse(turnOutput([bash('npm test', GREEN_TESTS)], '**Done:** titleCase handles mixed case.\nProof: npm test -> pass 6, fail 0'));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /contradicts/);
});

test('a reworded command and quote still match their run', () => {
  assert.equal(turnOutput([EDIT, bash('cd x && npm test 2>&1 | tail -20', GREEN_TESTS)], '**Done:** titleCase handles mixed case.\nProof: `npm test` -> `pass 5, fail 0`'), '');
  const product = bash('cd app && node bin/report.js --status paid 2>&1 | tail -5', 'orders: 4, total: 913.50 EUR');
  assert.equal(turnOutput([EDIT, product], '**Done:** wired --status.\nProof: `node bin/report.js --status paid` -> `orders: 4`'), '');
});

test('a failed test run never backs Done, and quoting its passes contradicts it', () => {
  assert.equal(JSON.parse(turnOutput([EDIT, bash('npm test', FAILED_TESTS, true)], '**Done:** titleCase handles mixed case.')).decision, 'block');
  const quoted = JSON.parse(turnOutput([EDIT, bash('npm test', FAILED_TESTS, true)], '**Done:** titleCase handles mixed case.\nProof: npm test -> ℹ pass 4'));
  assert.match(quoted.reason, /contradicts/);
});

test('a green verify.mjs run after the last edit backs a Done report', () => {
  assert.equal(turnOutput([EDIT, bash('node skills/verify/scripts/verify.mjs --plan plan.md', 'SUMMARY FAIL=0 WARN=0 UNRUN=0')], '**Done:** plan landed.'), '');
});
