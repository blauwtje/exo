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

test('stays silent on stop_hook_active when the report has no Proof line', () => {
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

function typedMessage(text) {
  return { type: 'user', message: { role: 'user', content: text } };
}

const SKILL_BODY = { type: 'user', isMeta: true, message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: /exo/skills/build\n\n# build' }] } };

test('stays silent on a later typed turn that did not call build', () => {
  const file = transcript([
    typedMessage('run the plan'),
    SKILL_CALL,
    SKILL_BODY,
    bashCall('toolu_bash1', 'node bin/report.js --status paid --file data/sample-orders.csv'),
    bashResult('toolu_bash1', 'orders: 4, total: 913.50 EUR'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: node bin/report.js --status paid --file data/sample-orders.csv -> orders: 4, total: 913.50 EUR'),
    typedMessage('pull main'),
    bashCall('toolu_bash2', 'git pull --ff-only'),
    bashResult('toolu_bash2', 'Already up to date.'),
    finalReport('**Done:** main is up to date.')
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
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

const NOTIFICATION_TEXT = '<task-notification><tool-use-id>toolu_x</tool-use-id><status>completed</status></task-notification>';
const NOTIFICATION = { type: 'user', origin: { kind: 'task-notification' }, turnOrigin: 'task_notification', message: { role: 'user', content: NOTIFICATION_TEXT } };

function notifiedAgentTurn(notification, beforeReport) {
  return [
    typedMessage('run the plan'),
    SKILL_CALL,
    SKILL_BODY,
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'toolu_x', input: { prompt: 'build task 1' } }] } },
    { type: 'user', toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: [{ type: 'text', text: 'Async agent launched successfully.\nagentId: a1' }] }] } },
    notification,
    ...beforeReport,
    finalReport('**Done:** wired --status into bin/report.js.')
  ];
}

test('checks the build turn across the skill body, a launch and its task notification', () => {
  const result = JSON.parse(stopOutput({ transcript_path: transcript(notifiedAgentTurn(NOTIFICATION, [])) }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /no Proof line/);
});

test('checks the build turn after Stop hook feedback', () => {
  const feedback = { type: 'user', isMeta: true, message: { role: 'user', content: [{ type: 'text', text: 'Stop hook feedback:\nThe report claims Done with no Proof line.' }] } };
  const result = JSON.parse(stopOutput({ transcript_path: transcript(notifiedAgentTurn(NOTIFICATION, [finalReport('Working on it.'), feedback])) }));
  assert.equal(result.decision, 'block');
});

test('checks the build turn after a task notification with no origin fields', () => {
  const olderNotification = { type: 'user', message: { role: 'user', content: NOTIFICATION_TEXT } };
  const result = JSON.parse(stopOutput({ transcript_path: transcript(notifiedAgentTurn(olderNotification, [])) }));
  assert.equal(result.decision, 'block');
});

test('passes a typed build turn whose Proof line its own Bash call backs', () => {
  const file = transcript([
    typedMessage('run the plan'),
    SKILL_CALL,
    SKILL_BODY,
    bashCall('toolu_bash1', 'node bin/report.js --status paid --file data/sample-orders.csv'),
    bashResult('toolu_bash1', 'orders: 4, total: 913.50 EUR'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: node bin/report.js --status paid --file data/sample-orders.csv -> orders: 4, total: 913.50 EUR')
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

function mcpCall(id, name) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', name, id, input: { mode: 'play' } }] } };
}

const PROOF_FEEDBACK = { type: 'user', isMeta: true, message: { role: 'user', content: 'Stop hook feedback:\nThe report claims Done with no Proof line. Run it, or report "Unverified: <reason>" without claiming Done.' } };
const UNRUN_PROOF = '**Done:** wired --status.\nProof: node bin/report.js --status open -> orders: 1';

test('blocks a Proof line naming a never-run command on stop_hook_active', () => {
  const file = transcript([SKILL_CALL, PROOF_FEEDBACK, finalReport(UNRUN_PROOF)]);
  const result = JSON.parse(stopOutput({ transcript_path: file, stop_hook_active: true }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /never ran/);
});

test('blocks a never-run second Proof line after a valid one', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'node bin/report.js --status paid'),
    bashResult('toolu_bash1', 'orders: 4, total: 913.50 EUR'),
    finalReport('**Done:** wired --status.\nProof: node bin/report.js --status paid -> orders: 4\nProof: node bin/report.js --status open -> orders: 1')
  ]);
  for (const active of [false, true]) {
    const result = JSON.parse(stopOutput({ transcript_path: file, stop_hook_active: active }));
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /--status open -> orders: 1" names a command or MCP tool this build turn never ran/);
  }
});

test('passes bulleted arrow Proof lines an MCP tool call backs', () => {
  const file = transcript([
    SKILL_CALL,
    mcpCall('toolu_mcp1', 'mcp__plugin_kit_studio__run_playtest'),
    bashResult('toolu_mcp1', '{"passed":true,"checks":{"total":16,"passed":16,"failed":0}}'),
    mcpCall('toolu_mcp2', 'mcp__plugin_kit_studio__search_game_tree'),
    bashResult('toolu_mcp2', '[{"fullPath":"ServerScriptService.Network"}]'),
    finalReport('**Done:** shop built.\n- Proof: `run_playtest mode=play` → `"checks":{"total":16,"passed":16,"failed":0}`\n* **Proof:** `mcp:search_game_tree keywords=Network` -> `ServerScriptService.Network`')
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});

test('blocks an MCP Proof whose output is not in that tool\'s result', () => {
  const file = transcript([
    SKILL_CALL,
    mcpCall('toolu_mcp1', 'mcp__plugin_kit_studio__user_mouse_input'),
    bashResult('toolu_mcp1', 'Success'),
    mcpCall('toolu_mcp2', 'mcp__plugin_kit_studio__execute_luau'),
    bashResult('toolu_mcp2', 'Coins: 0, WalkSpeed: 32'),
    finalReport('**Done:** shop built.\n- Proof: `user_mouse_input` click on BuyButton → `Coins: 0, WalkSpeed: 32`')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /no user_mouse_input call returned/);
});

test('stops blocking once the build turn holds the limit of proof-check blocks', () => {
  const once = transcript([SKILL_CALL, PROOF_FEEDBACK, finalReport(UNRUN_PROOF)]);
  const twice = transcript([SKILL_CALL, PROOF_FEEDBACK, finalReport('Working.'), PROOF_FEEDBACK, finalReport(UNRUN_PROOF)]);
  assert.equal(JSON.parse(stopOutput({ transcript_path: once, stop_hook_active: true })).decision, 'block');
  assert.equal(stopOutput({ transcript_path: twice, stop_hook_active: true }), '');
});
