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

function stopFor(rows, cwd) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proof-check-94-')), 'transcript.jsonl');
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  return stopOutput({ transcript_path: file, cwd });
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

// A build turn of tool calls, each [name, input, result, isError], ending on
// reportText, judged from cwd, else from this process's cwd.
function turnOutput(calls, reportText, cwd) {
  const rows = [BUILD_CALL];
  calls.forEach(([name, input, result, isError], index) => {
    rows.push({ type: 'assistant', message: { content: [{ type: 'tool_use', name, id: `toolu_${index}`, input }] } });
    if (result !== undefined) rows.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `toolu_${index}`, content: result, is_error: isError }] } });
  });
  return stopFor([...rows, reportRow(reportText)], cwd);
}

// A project directory holding manifest as its package.json.
function project(manifest) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-check-project-'));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  return directory;
}

const BIN_PACKAGE = { name: 'report', bin: { report: 'bin/report.js' }, scripts: { test: 'node --test' } };
const START_PACKAGE = { name: 'report', scripts: { start: 'node bin/report.js', test: 'node --test' } };
const LIBRARY_PACKAGE = { name: 'title-case', scripts: { test: 'node --test' } };
const PRODUCT_RUN = bash('node bin/report.js --status paid', 'orders: 4, total: 913.50 EUR');
const PRODUCT_PROOF = '**Done:** wired --status.\nProof: node bin/report.js --status paid -> orders: 4';
const VERIFY_RUN = bash('node skills/verify/scripts/verify.mjs --plan plan.md', 'SUMMARY FAIL=0 WARN=0 UNRUN=0');

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

test('in a package with a bin, only a green product run after the last edit backs Done', () => {
  const testsOnly = JSON.parse(turnOutput([EDIT, bash('npm test', GREEN_TESTS), VERIFY_RUN], '**Done:** wired --status.\nProof: npm test -> ℹ pass 5', project(BIN_PACKAGE)));
  assert.equal(testsOnly.decision, 'block');
  assert.match(testsOnly.reason, /needs a green run of `report`/);
  assert.equal(turnOutput([EDIT, PRODUCT_RUN], PRODUCT_PROOF, project(BIN_PACKAGE)), '');
  assert.equal(JSON.parse(turnOutput([PRODUCT_RUN, EDIT], PRODUCT_PROOF, project(BIN_PACKAGE))).decision, 'block');
});

test('in a package with a start script, a green npm start run backs Done and a test run does not', () => {
  const testsOnly = JSON.parse(turnOutput([EDIT, bash('npm test', GREEN_TESTS)], '**Done:** wired --status.', project(START_PACKAGE)));
  assert.match(testsOnly.reason, /needs a green run of `npm start`/);
  assert.equal(turnOutput([EDIT, bash('npm start', 'listening on 3000')], '**Done:** wired --status.', project(START_PACKAGE)), '');
});

test('in a package with neither a bin nor a start script, a green test or verify run still backs Done', () => {
  assert.equal(turnOutput([EDIT, bash('npm test', GREEN_TESTS)], '**Done:** titleCase handles mixed case.', project(LIBRARY_PACKAGE)), '');
  assert.equal(turnOutput([EDIT, VERIFY_RUN], '**Done:** plan landed.', project(LIBRARY_PACKAGE)), '');
  const stale = JSON.parse(turnOutput([bash('npm test', GREEN_TESTS), EDIT], '**Done:** titleCase handles mixed case.', project(LIBRARY_PACKAGE)));
  assert.match(stale.reason, /no test or product run went green after the last edit/);
});
