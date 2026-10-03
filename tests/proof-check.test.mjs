import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stopOutput } from '../skills/build/scripts/proof-check.mjs';

function transcript(entries) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proof-check-')), 'transcript.jsonl');
  fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return file;
}

const SKILL_CALL = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', id: 'toolu_skill', input: { skill: 'build' } }] } };

function bashCall(id, command, cwd) {
  return { type: 'assistant', cwd, message: { content: [{ type: 'tool_use', name: 'Bash', id, input: { command } }] } };
}

function writeCall(filePath) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: filePath } }] } };
}

function bashResult(id, text) {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } };
}

function finalReport(text) {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] } };
}

test('passes with a real Proof line the session ran', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'node bin/report.js --status paid --file data/sample-orders.csv'),
    bashResult('toolu_bash1', 'orders: 4, total: 913.50 EUR'),
    finalReport('**Done:** wired --status into bin/report.js, commit abc123.\nProof: node bin/report.js --status paid --file data/sample-orders.csv -> orders: 4, total: 913.50 EUR')
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});

test('blocks a Done claim proven only by a test runner', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'npm test'),
    bashResult('toolu_bash1', '# pass 5'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: npm test -> # pass 5')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /test runner/);
});

test('blocks a Proof line whose command was never run', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'npm test'),
    bashResult('toolu_bash1', '# pass 5'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: node bin/report.js --status paid -> orders: 4, total: 913.50 EUR')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
});

test('blocks a Proof line whose output does not match the real tool result', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'node bin/report.js --status paid --file data/sample-orders.csv'),
    bashResult('toolu_bash1', 'orders: 0, total: 0.00 EUR'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: node bin/report.js --status paid --file data/sample-orders.csv -> orders: 4, total: 913.50 EUR')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
});

test('passes an Unverified line that makes no Done claim', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'npm test'),
    bashResult('toolu_bash1', '# pass 5'),
    finalReport('--status wired into bin/report.js.\nUnverified: the real export is unreachable before 16:00.')
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});

test('stays silent when build was never called', () => {
  const file = transcript([
    bashCall('toolu_bash1', 'npm test'),
    bashResult('toolu_bash1', '# pass 5'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: npm test -> # pass 5')
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});

test('stays silent when stop_hook_active is true', () => {
  const file = transcript([
    SKILL_CALL,
    finalReport('**Done:** wired --status into bin/report.js.')
  ]);
  assert.equal(stopOutput({ transcript_path: file, stop_hook_active: true }), '');
});

test('blocks a Proof run on a fixture this session wrote with Write', () => {
  const file = transcript([
    SKILL_CALL,
    writeCall('/tmp/manual-orders.csv'),
    bashCall('toolu_bash1', 'node bin/report.js --file /tmp/manual-orders.csv --status paid'),
    bashResult('toolu_bash1', 'orders: 2, total: 12.50 EUR'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: node bin/report.js --file /tmp/manual-orders.csv --status paid -> orders: 2, total: 12.50 EUR')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /input this session wrote/);
});

test('blocks a Proof run on a fixture a heredoc Bash call wrote', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', "cat > /tmp/proof-orders.csv <<EOF\nid,status,total\n1,paid,12.50\nEOF", '/Users/thomash/project'),
    bashResult('toolu_bash1', ''),
    bashCall('toolu_bash2', 'node bin/report.js --file /tmp/proof-orders.csv --status paid'),
    bashResult('toolu_bash2', 'orders: 2, total: 12.50 EUR'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: node bin/report.js --file /tmp/proof-orders.csv --status paid -> orders: 2, total: 12.50 EUR')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /input this session wrote/);
});

test('does not block while a background launch is pending, and blocks once it has notified', () => {
  const launch = bashResult('toolu_agent', 'Async agent launched successfully.\nagentId: a1');
  const notice = { type: 'queue-operation', operation: 'enqueue', content: '<task-notification><tool-use-id>toolu_agent</tool-use-id></task-notification>' };
  const report = finalReport('**Done:** wired --status into bin/report.js.');
  assert.equal(stopOutput({ transcript_path: transcript([SKILL_CALL, launch, report]) }), '');
  assert.equal(JSON.parse(stopOutput({ transcript_path: transcript([SKILL_CALL, launch, notice, report]) })).decision, 'block');
});

test('does not treat a command after a cp destination as a written path', () => {
  const cwd = '/Users/thomash/Documents/Code/personal/plugins/exo';
  const proofCommand = 'git pull --ff-only -q && git status -sb | head -1 && git log --oneline -1';
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'T=$(mktemp -d /tmp/verify-fail-XXXX); cp -R /Users/thomash/bench-runs/lean-gates-2026-10-02/02-new/repo "$T/repo"; echo $T; grep -n "assert" "$T/repo/tests/tax.test.ts" | head -5', cwd),
    bashResult('toolu_bash1', '/tmp/verify-fail-AbCd'),
    bashCall('toolu_bash2', proofCommand, cwd),
    bashResult('toolu_bash2', '## main...origin/main\n22b7548b chore(release): 0.78.0'),
    finalReport(`**Done:** pulled main.\nProof: \`${proofCommand}\` -> \`## main...origin/main\``)
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});

test('does not match a written path that is only a substring of a Proof token', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'node scripts/build.mjs > out', '/repo'),
    bashResult('toolu_bash1', ''),
    bashCall('toolu_bash2', 'node scripts/layout.mjs', '/repo'),
    bashResult('toolu_bash2', 'layout: 3 columns'),
    finalReport('**Done:** fixed the layout.\nProof: node scripts/layout.mjs -> layout: 3 columns')
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});

test('blocks a Proof naming the absolute form of a relative written path', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'echo \'{"a":1}\' > fixtures/in.json', '/repo'),
    bashResult('toolu_bash1', ''),
    bashCall('toolu_bash2', 'node bin/cli.js /repo/fixtures/in.json', '/repo'),
    bashResult('toolu_bash2', 'a: 1'),
    finalReport('**Done:** parsed input.\nProof: node bin/cli.js /repo/fixtures/in.json -> a: 1')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /input this session wrote/);
});
