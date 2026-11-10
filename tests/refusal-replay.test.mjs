import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'refusals');
const INHERITED = ['TE_SIDECALL', 'EXO_RUN_SESSION', 'EXO_RUN_DIR'];
const BIG_COMMAND = 'x'.repeat(20000);

const rowsOf = (file) => JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));

const inputOf = (row) => JSON.parse(JSON.stringify(row.input).replace('__BIG__', BIG_COMMAND));

function shellTranscript(row, cwd) {
  const entries = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test', run_in_background: true } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: row.result }] } }
  ];
  const file = path.join(cwd, 'agent.jsonl');
  fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  return { agent_transcript_path: file };
}

function payloadOf(row, cwd) {
  const subagent = row.transcript === 'subagent' ? { agent_id: `replay-worker-${process.pid}-${Date.now()}`, agent_type: 'general-purpose' } : {};
  const shells = row.result ? shellTranscript(row, cwd) : {};
  return {
    hook_event_name: 'PreToolUse',
    tool_name: row.tool ?? 'Bash',
    tool_input: inputOf(row),
    cwd,
    session_id: `replay-${row.rule}-${process.pid}-${Date.now()}`,
    permission_mode: 'bypassPermissions',
    ...subagent,
    ...shells
  };
}

function decisionOf(run) {
  if (run.status === 2) return { kind: 'deny', text: run.stderr };
  const output = run.stdout.trim() ? JSON.parse(run.stdout) : {};
  const fields = output.hookSpecificOutput ?? {};
  if (fields.permissionDecision === 'deny') return { kind: 'deny', text: fields.permissionDecisionReason ?? '' };
  if (fields.updatedInput) return { kind: 'rewrite', text: '' };
  return { kind: 'allow', text: '' };
}

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !INHERITED.includes(name)));

function replay(row) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'refusal-replay-'));
  spawnSync('git', ['init', '-q'], { cwd });
  const run = spawnSync('node', [path.join(ROOT, 'hooks', row.hook)], {
    input: JSON.stringify(payloadOf(row, cwd)),
    encoding: 'utf8',
    cwd,
    env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: cwd, CLAUDE_PLUGIN_ROOT: ROOT },
    timeout: 15000
  });
  return decisionOf(run);
}

for (const file of fs.readdirSync(FIXTURES).filter((name) => name.endsWith('.json'))) {
  for (const row of rowsOf(file)) {
    test(`${file}: ${row.rule} ${row.transcript} is ${row.expect}`, () => {
      const decision = replay(row);
      assert.equal(decision.kind, row.expect, decision.text);
      assert.ok(decision.text.includes(row.says), decision.text);
    });
  }
}

test('every row names its rule, hook, transcript and expectation', () => {
  for (const file of fs.readdirSync(FIXTURES).filter((name) => name.endsWith('.json'))) {
    for (const row of rowsOf(file)) {
      assert.ok(row.rule && row.hook && row.input && row.transcript, JSON.stringify(row));
      assert.ok(['allow', 'deny', 'rewrite'].includes(row.expect), JSON.stringify(row));
      assert.equal(typeof row.says, 'string');
    }
  }
});
