import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { predispatchDecision } from '../lib/slice-state.mjs';

const skillsDir = path.resolve(import.meta.dirname, '../skills');

function fork(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fork-output-'));
  const transcript = path.join(dir, 'agent.jsonl');
  const text = `Base directory for this skill: ${path.join(skillsDir, name)}\n\nbody\n\nARGUMENTS: https://example.com/v`;
  fs.writeFileSync(transcript, `${JSON.stringify({ message: { content: [{ type: 'text', text }] } })}\n{}\n`);
  return { dir, input: { agent_id: `fork-output-${path.basename(dir)}`, agent_type: 'exo:orchestrator', agent_transcript_path: transcript, cwd: dir } };
}

const read = ({ input }, file) => predispatchDecision({ ...input, tool_name: 'Read', tool_input: { file_path: file } });

test('a watch fork reads its own run output before its first dispatch', () => {
  const agent = fork('watch');
  assert.equal(read(agent, path.join(agent.dir, '.exo/watch/abc/transcript.txt')), null);
  fs.rmSync(agent.dir, { recursive: true, force: true });
});

test('a watch fork is still denied repository source and other skills run folders', () => {
  const agent = fork('watch');
  assert.ok(read(agent, path.join(agent.dir, 'lib/slice-state.mjs')).deny);
  assert.ok(read(agent, path.join(agent.dir, '.exo/other/abc/transcript.txt')).deny);
  fs.rmSync(agent.dir, { recursive: true, force: true });
});
