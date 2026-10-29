import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPhases } from '../benchmarks/build-phases.mjs';

function message(id, tool) {
  const content = tool ? [{ type: 'tool_use', id: `tool-${id}`, name: tool.name, input: tool.input }] : [{ type: 'text', text: 'ok' }];
  return JSON.stringify({ type: 'assistant', message: { id, content, usage: { input_tokens: 0, output_tokens: 10 } } });
}

function phasesOf(tool) {
  const directory = mkdtempSync(join(tmpdir(), 'build-phases-'));
  const file = join(directory, 'main.jsonl');
  writeFileSync(file, [message('m1'), message('m2', tool), message('m3'), message('m4')].join('\n'));
  return buildPhases(file);
}

for (const skill of ['exo:verify', 'exo:gate', 'verify', 'gate']) {
  test(`a Skill call to ${skill} starts the verify phase`, () => {
    const phases = phasesOf({ name: 'Skill', input: { skill } });
    assert.equal(phases.setup, 10);
    assert.equal(phases.verify, 20);
  });
}

for (const script of ['verify.mjs', 'gate.mjs']) {
  test(`a Bash call to node skills/x/scripts/${script} starts the verify phase`, () => {
    const phases = phasesOf({ name: 'Bash', input: { command: `node skills/x/scripts/${script} --plan p.md` } });
    assert.equal(phases.setup, 10);
    assert.equal(phases.verify, 20);
  });
}

test('a Skill call to another skill or another script leaves the phase at setup', () => {
  assert.equal(phasesOf({ name: 'Skill', input: { skill: 'exo:gated' } }).verify, 0);
  assert.equal(phasesOf({ name: 'Bash', input: { command: 'node skills/x/scripts/regate.mjs' } }).verify, 0);
});
