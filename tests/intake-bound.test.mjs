import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { contextHook } from '../hooks/context-limit.mjs';
import { agentContextTarget, dispatchBytesPerToken } from '../lib/context-limits.mjs';
import { tempDir } from './harness.mjs';

const testHome = tempDir('exo-intake-home-');
process.env.HOME = testHome;
process.env.USERPROFILE = testHome;

const TARGET = agentContextTarget();
const BYTES = dispatchBytesPerToken();
const dir = tempDir('exo-intake-');
const transcript_path = path.join(dir, 'session.jsonl');
const agentTranscript = path.join(dir, 'agent.jsonl');
const testLog = path.join(dir, 'npm-test.log');
const sourceFile = path.join(dir, 'source.mjs');
const smallFile = path.join(dir, 'small.md');
const persisted = path.join(dir, 'session', 'tool-results', 'b42.txt');

fs.writeFileSync(testLog, Array.from({ length: 2696 }, (_, index) => `ok ${index + 1} - a passing test line that only says this case passed ......`).join('\n'));
fs.writeFileSync(sourceFile, `${'export const line = "a line of source code in a module";\n'.repeat(800)}`);
fs.writeFileSync(smallFile, `${'a short note\n'.repeat(40)}`);
fs.mkdirSync(path.dirname(persisted), { recursive: true });
fs.writeFileSync(persisted, `${'a persisted tool output line, too large to show inline\n'.repeat(1100)}`);

function growTo(tokens) {
  fs.writeFileSync(agentTranscript, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
}

const agent = { session_id: 's', transcript_path, agent_id: `a-intake-${process.pid}`, agent_type: 'exo:build-task', agent_transcript_path: agentTranscript, permission_mode: 'bypassPermissions' };
const read = (tool_input, caller = agent) => contextHook({ ...caller, tool_name: 'Read', tool_input }, () => false)?.hookSpecificOutput;
const bash = async (command, caller = agent) => (await dispatchBash({ ...caller, tool_name: 'Bash', tool_use_id: 'u1', tool_input: { command } }, undefined, () => false))?.hookSpecificOutput;

const denied = (fields) => fields?.permissionDecision === 'deny';

test('replay: a Read over the room left is cut to the lines that fit and the agent is told how to read the rest', () => {
  growTo(40_000);
  const room = (TARGET - 40_000) * BYTES;
  const cut = read({ file_path: sourceFile, offset: 11 });
  const lineBytes = Buffer.byteLength('export const line = "a line of source code in a module";\n');
  assert.equal(cut.permissionDecision, undefined);
  assert.deepEqual(cut.updatedInput, { file_path: sourceFile, offset: 11, limit: Math.floor(room / lineBytes) });
  assert.match(cut.additionalContext, /cut/);
  assert.match(cut.additionalContext, new RegExp(`lines 11-${10 + cut.updatedInput.limit}`));
  assert.match(cut.additionalContext, new RegExp(`offset ${11 + cut.updatedInput.limit}`));
  assert.match(cut.additionalContext, /grep -n/);
});

test('replay: a Read whose first line alone is over the room left is still denied', () => {
  growTo(10_000);
  const longLine = path.join(dir, 'long-line.log');
  fs.writeFileSync(longLine, `${'x'.repeat(200_000)}\n`);
  const denial = read({ file_path: longLine });
  assert.equal(denial.permissionDecision, 'deny');
  assert.match(denial.permissionDecisionReason, /grep|head -c/);
});

test('replay: a growing agent is steered to grep or a line range once a read would pass the room left of its target', async () => {
  growTo(10_000);
  assert.equal(denied(read({ file_path: smallFile })), false, 'small read at 10k');
  assert.equal(denied(read({ file_path: sourceFile })), false, 'whole source file at 10k');
  const logRead = read({ file_path: testLog });
  assert.equal(denied(logRead), false, 'whole npm test log at 10k is cut, not denied');
  assert.equal(logRead.permissionDecision, undefined);
  assert.equal(logRead.updatedInput.offset, 1);
  assert.ok(logRead.updatedInput.limit > 0 && logRead.updatedInput.limit < 2696);
  assert.match(logRead.additionalContext, new RegExp(`lines 1-${logRead.updatedInput.limit} .*offset ${logRead.updatedInput.limit + 1}.*grep -n`));
  assert.equal(denied(read({ file_path: testLog, offset: 2690, limit: 7 })), false, 'tail range of the log');
  assert.equal((await bash(`cat '${testLog}'`))?.updatedInput, undefined, 'Bash with room left is not rewritten');

  growTo(40_000);
  assert.equal(denied(read({ file_path: smallFile })), false, 'small read at 40k');
  const sourceRead = read({ file_path: sourceFile });
  assert.equal(denied(sourceRead), false, 'whole source file at 40k is cut, not denied');
  assert.equal(sourceRead.permissionDecision, undefined);
  assert.match(sourceRead.additionalContext, /grep -n/);
  const persistedRead = read({ file_path: persisted });
  assert.equal(denied(persistedRead), false, 'whole persisted result at 40k is cut, not denied');
  assert.match(persistedRead.additionalContext, /offset \d+/);
  assert.equal(denied(read({ file_path: persisted, offset: 1, limit: 50 })), false, 'persisted range at 40k');

  growTo(50_000);
  const room = (TARGET - 50_000) * BYTES;
  const cut = await bash(`cat '${testLog}'`);
  assert.match(cut.updatedInput.command, new RegExp(`head -c ${room} `));
  assert.match(cut.updatedInput.command, /grep -n/);
  assert.equal(denied(read({ file_path: smallFile })), false, 'small read at 50k');

  growTo(TARGET + 1000);
  assert.match(read({ file_path: testLog }).permissionDecisionReason, /Status: handover/);
  assert.match((await bash(`cat '${testLog}'`)).updatedInput.command, /head -c 4096 /);

  const lead = { session_id: 's', transcript_path, permission_mode: 'bypassPermissions' };
  assert.equal(read({ file_path: testLog }, lead), undefined, 'the lead reads as before');
  assert.equal((await bash(`cat '${testLog}'`, lead))?.updatedInput, undefined, 'the lead runs Bash as before');
});

const catalog = JSON.parse(fs.readFileSync(new URL('../lib/run-providers.json', import.meta.url), 'utf8')).defaults;
const search = (tool_name, tool_input, caller = agent) => contextHook({ ...caller, tool_name, tool_input }, () => false)?.hookSpecificOutput;

test('replay: a growing agent has its Grep and ToolSearch cut to the room left, and a Glob over the room steered to Grep', () => {
  growTo(50_000);
  const room = (TARGET - 50_000) * BYTES;
  const lines = Math.floor(room / catalog.searchLineBytes);
  const grep = search('Grep', { pattern: 'line', path: dir, output_mode: 'content' });
  assert.equal(grep?.updatedInput?.head_limit, lines, 'whole Grep at 50k is cut to the room left');
  assert.equal(grep.updatedInput.pattern, 'line');
  assert.match(grep.additionalContext, new RegExp(`offset ${lines}`));
  assert.equal(search('Grep', { pattern: 'line', head_limit: 0 })?.updatedInput?.head_limit, lines, 'unlimited Grep at 50k');
  assert.equal(search('Grep', { pattern: 'line', head_limit: 10 }), undefined, 'a Grep that fits runs as asked');
  assert.equal(search('ToolSearch', { query: 'slack' }), undefined, 'five tool schemas fit at 50k');
  assert.equal(denied(search('Glob', { pattern: '**/*.mjs' })), false, 'a full Glob fits at 50k');
  assert.equal(denied(search('WebSearch', { query: 'node test runner' })), false, 'a web search fits at 50k');

  growTo(54_000);
  const glob = search('Glob', { pattern: '**/*.mjs', path: dir });
  assert.equal(denied(glob), true, 'a Glob that may pass the room left at 54k');
  assert.match(glob.permissionDecisionReason, /Grep/);
  assert.match(glob.permissionDecisionReason, /files_with_matches/);

  growTo(59_000);
  const floor = catalog.resultCapBytes;
  assert.equal(search('ToolSearch', { query: 'slack', max_results: 5 })?.updatedInput?.max_results, Math.floor(floor / catalog.toolSchemaBytes), 'ToolSearch at 59k');
  assert.equal(search('ToolSearch', { query: 'select:Monitor,WebFetch' }), undefined, 'a select ToolSearch names its tools');
  assert.equal(search('Grep', { pattern: 'line', offset: 30 })?.updatedInput?.head_limit, Math.floor(floor / catalog.searchLineBytes));
  assert.match(search('Grep', { pattern: 'line', offset: 30 }).additionalContext, new RegExp(`offset ${30 + Math.floor(floor / catalog.searchLineBytes)}`));

  growTo(TARGET + 1000);
  assert.match(search('Grep', { pattern: 'line' }).permissionDecisionReason, /Status: handover/);

  const capped = { ...agent, agent_id: `a-capped-${process.pid}`, agent_type: 'general-purpose' };
  growTo(10_000);
  const cappedGrep = search('Grep', { pattern: 'line' }, capped);
  assert.equal(cappedGrep.updatedInput.head_limit, Math.floor(floor / catalog.searchLineBytes), 'a capped agent Grep at 10k');
  assert.match(cappedGrep.additionalContext, /exo result cap/);
  assert.equal(denied(search('Glob', { pattern: '**/*' }, capped)), false, 'a capped agent Glob with room left');

  const lead = { session_id: 's', transcript_path, permission_mode: 'bypassPermissions' };
  assert.equal(search('Grep', { pattern: 'line' }, lead), undefined, 'the lead greps as before');
  assert.equal(search('Glob', { pattern: '**/*' }, lead), undefined, 'the lead globs as before');
});

test('replay: in every permission mode an over-room Read or Grep is cut by updatedInput alone, so the permission prompt still runs', () => {
  growTo(40_000);
  for (const mode of ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto']) {
    const prompted = { ...agent, permission_mode: mode };
    const sourceRead = read({ file_path: sourceFile }, prompted);
    assert.equal(denied(sourceRead), false, `an over-room Read in ${mode} mode is cut, not denied`);
    assert.equal(sourceRead.permissionDecision, undefined, `the cut in ${mode} mode leaves the permission decision to the prompt`);
    assert.ok(sourceRead.updatedInput.limit > 0, `${mode} mode`);
    assert.equal(read({ file_path: smallFile }, prompted), undefined, `a small Read in ${mode} mode`);
  }

  growTo(50_000);
  const lines = Math.floor((TARGET - 50_000) * BYTES / catalog.searchLineBytes);
  const grep = search('Grep', { pattern: 'line' }, { ...agent, permission_mode: 'acceptEdits' });
  assert.equal(denied(grep), false, 'an over-room Grep in acceptEdits mode is cut, not denied');
  assert.equal(grep.permissionDecision, undefined);
  assert.equal(grep.updatedInput.head_limit, lines);
  const fits = search('Grep', { pattern: 'line', head_limit: lines }, { ...agent, permission_mode: 'default' });
  assert.equal(fits?.updatedInput, undefined, 'the Grep that fits runs as asked');

  const capped = { ...agent, permission_mode: 'plan', agent_id: `a-capped-plan-${process.pid}`, agent_type: 'general-purpose' };
  growTo(10_000);
  const cappedRead = read({ file_path: sourceFile }, capped);
  assert.equal(denied(cappedRead), false, 'a result-capped Read in plan mode is cut');
  assert.equal(cappedRead.updatedInput.offset, 1);
});
