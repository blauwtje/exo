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

// A project directory holding manifestText as its package.json, or none when null.
function project(manifestText) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-check-project-'));
  if (manifestText !== null) fs.writeFileSync(path.join(directory, 'package.json'), manifestText);
  return directory;
}

const LIBRARY = '{"name":"title-case","scripts":{"test":"node --test"}}';

function testRunnerTurn(report) {
  return transcript([SKILL_CALL, bashCall('toolu_bash1', 'npm test'), bashResult('toolu_bash1', '# tests 5\n# pass 5\n# fail 0'), finalReport(report)]);
}

test('passes a Done claim a green test run backs when package.json names no bin and no start script', () => {
  const file = testRunnerTurn('**Done:** wired --status into bin/report.js.\nProof: npm test -> # pass 5');
  for (const manifest of [LIBRARY, null, '{not json']) {
    assert.equal(stopOutput({ transcript_path: file, cwd: project(manifest) }), '');
  }
});

test('blocks a Done claim only a test run backs when package.json names a bin or start script, naming the run it needs', () => {
  const file = testRunnerTurn('**Done:** wired --status into bin/report.js.\nProof: npm test -> # pass 5');
  const cases = [['{"bin":"bin/report.js"}', /`bin\/report\.js`/], ['{"bin":{"report":"bin/report.js"}}', /`report`/], ['{"scripts":{"start":"node bin/report.js","test":"node --test"}}', /`npm start`/]];
  for (const [manifest, needed] of cases) {
    const result = JSON.parse(stopOutput({ transcript_path: file, cwd: project(manifest) }));
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /no product run went green after the last edit/);
    assert.match(result.reason, needed);
    assert.match(result.reason, /names a test run, not the product/);
  }
});

test('reads the git checkout root\'s package.json when the cwd holds none', () => {
  const root = project('{"bin":"bin/report.js"}');
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, 'src'));
  const result = JSON.parse(stopOutput({ transcript_path: testRunnerTurn('**Done:** wired --status.\nProof: npm test -> # pass 5'), cwd: path.join(root, 'src') }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /`bin\/report\.js`/);
});

test('blocks an unrun or contradicted test-runner Proof', () => {
  const unrun = transcript([SKILL_CALL, finalReport('**Done:** titleCase handles mixed case.\nProof: npm test -> # pass 5')]);
  const contradicted = testRunnerTurn('**Done:** titleCase handles mixed case.\nProof: npm test -> tests 5, pass 6, fail 0');
  for (const [file, problem] of [[unrun, /never ran/], [contradicted, /quotes a result its run contradicts/]]) {
    const result = JSON.parse(stopOutput({ transcript_path: file, cwd: project(LIBRARY) }));
    assert.equal(result.decision, 'block');
    assert.match(result.reason, problem);
  }
});

test('blocks a Proof line whose command was never run', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'npm test'),
    bashResult('toolu_bash1', '# pass 5'),
    writeCall('/repo/src/report.js'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: node bin/report.js --status paid -> orders: 4, total: 913.50 EUR')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /never ran/);
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

test('blocks a Done report with no Proof line on stop_hook_active', () => {
  const file = transcript([
    SKILL_CALL,
    finalReport('**Done:** wired --status into bin/report.js.')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file, stop_hook_active: true }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /claims Done/);
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

test('does not block while a background launch is pending or only queued, and blocks once it has notified', () => {
  const launch = bashResult('toolu_agent', 'Async agent launched successfully.\nagentId: a1');
  const text = '<task-notification><tool-use-id>toolu_agent</tool-use-id></task-notification>';
  const queued = { type: 'queue-operation', operation: 'enqueue', content: text };
  const notice = { type: 'user', message: { role: 'user', content: text } };
  const report = finalReport('**Done:** wired --status into bin/report.js.');
  assert.equal(stopOutput({ transcript_path: transcript([SKILL_CALL, launch, report]) }), '');
  assert.equal(stopOutput({ transcript_path: transcript([SKILL_CALL, launch, queued, report]) }), '');
  assert.equal(JSON.parse(stopOutput({ transcript_path: transcript([SKILL_CALL, launch, queued, notice, report]) })).decision, 'block');
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
  assert.match(result.reason, /claims Done/);
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

const PROOF_FEEDBACK = { type: 'user', isMeta: true, message: { role: 'user', content: 'Stop hook feedback:\nexo proof-check: No call this build turn backs "node bin/report.js --status open".' } };
const UNRUN_PROOF = '**Done:** wired --status.\nProof: node bin/report.js --status open -> orders: 1';

test('blocks a Proof line naming a never-run command on stop_hook_active', () => {
  const file = transcript([SKILL_CALL, PROOF_FEEDBACK, finalReport(UNRUN_PROOF)]);
  const result = JSON.parse(stopOutput({ transcript_path: file, stop_hook_active: true }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /never ran/);
});

test('blocks a Done report whose named runs all predate the last edit, naming each Proof\'s problem', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'node bin/report.js --status paid'),
    bashResult('toolu_bash1', 'orders: 4, total: 913.50 EUR'),
    writeCall('/repo/src/report.js'),
    finalReport('**Done:** wired --status.\nProof: node bin/report.js --status paid -> orders: 4\nProof: node bin/report.js --status open -> orders: 1')
  ]);
  for (const active of [false, true]) {
    const result = JSON.parse(stopOutput({ transcript_path: file, stop_hook_active: active }));
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /--status paid -> orders: 4" has no green run after the last edit/);
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

test('matches an unprefixed known MCP tool Proof against that tool\'s calls, never a Bash run of it', () => {
  const failedBash = [bashCall('toolu_bash1', 'run_playtest mode=play'), bashResult('toolu_bash1', 'bash: run_playtest: command not found')];
  const report = finalReport('**Done:** shop built.\nProof: run_playtest mode=play -> "passed":true');
  const backed = transcript([
    SKILL_CALL,
    ...failedBash,
    mcpCall('toolu_mcp1', 'mcp__plugin_kit_studio__run_playtest'),
    bashResult('toolu_mcp1', '{"passed":true}'),
    report
  ]);
  assert.equal(stopOutput({ transcript_path: backed }), '');
  const bashOnly = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'run_playtest mode=play'),
    bashResult('toolu_bash1', '"passed":true'),
    report
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: bashOnly }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /names a command or MCP tool this build turn never ran/);
});

test('blocks an MCP Proof whose quote that tool\'s result contradicts', () => {
  const file = transcript([
    SKILL_CALL,
    mcpCall('toolu_mcp1', 'mcp__plugin_kit_studio__user_mouse_input'),
    bashResult('toolu_mcp1', 'Coins: 0, WalkSpeed: 16'),
    mcpCall('toolu_mcp2', 'mcp__plugin_kit_studio__execute_luau'),
    bashResult('toolu_mcp2', 'Coins: 0, WalkSpeed: 32'),
    finalReport('**Done:** shop built.\n- Proof: `user_mouse_input` click on BuyButton → `Coins: 0, WalkSpeed: 32`')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /quotes a result its run contradicts/);
});

// The build turn after `blocks` proof-check blocks, each stopping UNRUN_PROOF, ending on `report`.
function blockedTurn(blocks, report, before = []) {
  const rows = [SKILL_CALL, ...before];
  for (let block = 0; block < blocks; block += 1) rows.push(finalReport(UNRUN_PROOF), PROOF_FEEDBACK);
  return transcript([...rows, finalReport(report)]);
}

test('still blocks a Done report with an unbacked Proof after two blocks', () => {
  const result = JSON.parse(stopOutput({ transcript_path: blockedTurn(2, UNRUN_PROOF), stop_hook_active: true }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /claims Done, but no test or product run went green after the last edit/);
  assert.match(result.reason, /"node bin\/report\.js --status open -> orders: 1" names a command or MCP tool this build turn never ran/);
  assert.match(result.reason, /report "Unverified: <reason>" without claiming Done/);
});

test('passes a report without Done that keeps a Proof or Unverified line, and blocks one that still claims Done unbacked', () => {
  const paid = [bashCall('toolu_bash1', 'node bin/report.js --status paid'), bashResult('toolu_bash1', 'orders: 4')];
  const earlier = '**Done:** wired.\nProof: node bin/report.js --status paid -> orders: 4\nProof: mcp:run_playtest mode=play -> passed';
  const file = transcript([
    SKILL_CALL, ...paid, finalReport(earlier), PROOF_FEEDBACK,
    finalReport('Wired --status.\nProof: node bin/report.js --status paid -> orders: 4\n- **Unverified:** `mcp__plugin_kit_studio__run_playtest` (Studio closed)')
  ]);
  assert.equal(stopOutput({ transcript_path: file, stop_hook_active: true }), '');
  const stillDone = transcript([SKILL_CALL, finalReport(UNRUN_PROOF), PROOF_FEEDBACK, finalReport('**Done:** wired.\nUnverified: node bin/report.js --status open (no open orders)')]);
  assert.match(JSON.parse(stopOutput({ transcript_path: stillDone, stop_hook_active: true })).reason, /claims Done/);
});

test('ends the turn with a systemMessage, not a block, at the ceiling of proof-check blocks', () => {
  assert.equal(JSON.parse(stopOutput({ transcript_path: blockedTurn(4, UNRUN_PROOF), stop_hook_active: true })).decision, 'block');
  const result = JSON.parse(stopOutput({ transcript_path: blockedTurn(5, UNRUN_PROOF), stop_hook_active: true }));
  assert.equal(result.decision, undefined);
  assert.equal(result.systemMessage, 'exo proof-check: report not verified; Unverified: node bin/report.js --status open (no matching call after 5 blocks)');
});
