import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { verifyBlock } from '../benchmarks/checkpoint-fork.mjs';
import { subagentTypes } from '../benchmarks/fix-round.mjs';
import { cellRow } from '../benchmarks/improve-speed.mjs';
import { addLine, emptyRecord } from '../benchmarks/session-stats.mjs';
import { reviewStages } from '../benchmarks/sweep-score.mjs';
import { tempDir } from './harness.mjs';

const LEGACY_FIX = ['exo', 'fix-review'].join(':');

const FIX_BRIEF = 'exo-kind: fix-review\nFix the findings.';
const BUILD_BRIEF = 'Build task 1 of the plan.';

const usageLine = (id, brief) => JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { content: brief, id } });

function writeSession(directory) {
  const main = path.join(directory, 'session.jsonl');
  fs.writeFileSync(main, `${JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { id: 'm1', usage: { output_tokens: 1 }, content: [] } })}\n`);
  const agents = path.join(directory, 'session', 'subagents');
  fs.mkdirSync(agents, { recursive: true });
  const briefs = { 'agent-a': BUILD_BRIEF, 'agent-b': FIX_BRIEF };
  for (const [name, brief] of Object.entries(briefs)) {
    fs.writeFileSync(path.join(agents, `${name}.jsonl`), `${usageLine(name, brief)}\n`);
    fs.writeFileSync(path.join(agents, `${name}.meta.json`), '{"agentType":"exo:build-task"}');
  }
  return main;
}

test('one build-task dispatch and one fix-round dispatch count as exactly 1 fix round per script', () => {
  const directory = tempDir('fix-rounds-test-');
  const main = writeSession(directory);
  const transcript = path.join(directory, 'session.jsonl');
  const types = subagentTypes(transcript);
  assert.equal(reviewStages(types, '').fixReview, 1);
  assert.equal(verifyBlock(main).subagents.filter((type) => type.endsWith('fix-review')).length, 1);

  const cell = path.join(directory, 'cell');
  fs.mkdirSync(cell);
  fs.writeFileSync(path.join(cell, 'record.json'), JSON.stringify({ exitCode: 0, timedOut: false, hiddenPass: true, defects: [], verifyRan: true, outputTokens: 1 }));
  fs.writeFileSync(path.join(cell, 'usage.json'), JSON.stringify({ transcript, subagents: types }));
  assert.equal(cellRow(cell).fixRounds, 1);

  const record = emptyRecord();
  const dispatch = (prompt) => ({ type: 'tool_use', name: 'Agent', input: { subagent_type: 'exo:build-task', prompt } });
  addLine(record, JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { content: [dispatch(BUILD_BRIEF), dispatch(FIX_BRIEF)] } }));
  assert.equal(record.fixReviewDispatches, 1);
});

test('a legacy fix-review subagent still counts as a fix round', () => {
  assert.equal(reviewStages([LEGACY_FIX, 'exo:build-task'], '').fixReview, 1);
  const record = emptyRecord();
  addLine(record, JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: LEGACY_FIX } }] } }));
  assert.equal(record.fixReviewDispatches, 1);
});
