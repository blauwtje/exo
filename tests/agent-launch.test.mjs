import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve('skills/gate/scripts/context-peaks.mjs');

function orchestratorFolder(input) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-launch-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${JSON.stringify({ type: 'user', entrypoint: 'cli', message: { content: 'go' } })}\n`);
  const lines = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Agent', input }] } },
    { type: 'assistant', message: { stop_reason: 'end_turn', content: [] } },
    { type: 'user', message: { content: '<task-notification>done</task-notification>' } },
    { type: 'assistant', message: { content: [] } },
  ];
  for (let index = 0; index < 10; index += 1) {
    fs.writeFileSync(path.join(subagents, `agent-r${index}.jsonl`), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
    fs.writeFileSync(path.join(subagents, `agent-r${index}.meta.json`), JSON.stringify({ agentType: 'exo:orchestrator' }));
  }
  return folder;
}

const interactive = (folder) => execFileSync('node', [script, '--folder', folder, '--since', '0', '--resumed'], { encoding: 'utf8' }).trim().split('\n')[0];

test('an Agent launch with no run_in_background counts as background, the platform default', () => {
  assert.equal(interactive(orchestratorFolder({ subagent_type: 'general-purpose', prompt: 'p' })), 'interactive resumed=10 of 10 W1');
});

test('only run_in_background: false counts as a foreground launch', () => {
  assert.equal(interactive(orchestratorFolder({ subagent_type: 'general-purpose', prompt: 'p', run_in_background: false })), 'interactive resumed=0 of 0 PENDING n=0 of 10');
});
