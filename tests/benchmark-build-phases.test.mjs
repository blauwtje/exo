// The build phase split: every call lands in one phase and the phases sum to
// the transcript's total, with the lead's turn moving at the boundary calls.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { sumCounts } from '#token-weights';
import { transcriptCalls } from '../benchmarks/cell-usage.mjs';
import { buildPhases, meanPhases, PHASES } from '../benchmarks/build-phases.mjs';

let serial = 0;

function assistant(id, output, ...tools) {
  const content = tools.map((tool) => ({ type: 'tool_use', id: `tool-${(serial += 1)}`, ...tool }));
  if (content.length === 0) content.push({ type: 'text', text: 'ok' });
  const usage = { input_tokens: 0, cache_read_input_tokens: 0, output_tokens: output };
  return { type: 'assistant', message: { id, model: 'm', content, usage } };
}

const bash = (command) => ({ name: 'Bash', input: { command } });
const dispatch = (subagent_type) => ({ name: 'Agent', input: { subagent_type, prompt: 'p' } });
const notification = (id) => ({ type: 'user', message: { role: 'user', content: `<task-notification><tool-use-id>${id}</tool-use-id></task-notification>` } });
const block = { type: 'attachment', attachment: { type: 'hook_blocking_error', hookEvent: 'Stop' } };

function transcript(lines, agents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'build-phases-'));
  const main = path.join(directory, 'session.jsonl');
  fs.writeFileSync(main, lines.map((line) => JSON.stringify(line)).join('\n'));
  fs.mkdirSync(path.join(directory, 'session', 'subagents'), { recursive: true });
  for (const [name, agentType, output] of agents) {
    const file = path.join(directory, 'session', 'subagents', name);
    fs.writeFileSync(`${file}.jsonl`, `${JSON.stringify(assistant(`sub-${name}`, output))}\n`);
    fs.writeFileSync(`${file}.meta.json`, JSON.stringify({ agentType }));
  }
  return main;
}

test('each call lands in the phase its turn is in and the phases sum to the total', () => {
  const build = assistant('m2', 20, dispatch('exo:build-task'));
  const buildId = build.message.content[0].id;
  const lines = [
    assistant('m1', 10, bash('git status')),
    build,
    assistant('m3', 30),
    notification(buildId),
    assistant('m4', 40, bash('git status --porcelain')),
    assistant('m5', 50, bash('node skills/build/scripts/land-task.mjs --task 1')),
    assistant('m6', 60, bash('git cherry-pick abc')),
    assistant('m7', 70, { name: 'Skill', input: { skill: 'exo:verify' } }),
    assistant('m8', 80, bash('cat skills/verify/scripts/verify.mjs')),
    assistant('m9', 90, dispatch('exo:review-branch')),
    assistant('m10', 100),
    block,
    assistant('m11', 110, bash('node skills/verify/scripts/verify.mjs --plan p')),
    assistant('m12', 120, bash('npm test')),
    assistant('m13', 130)
  ];
  const main = transcript(lines, [['agent-a', 'exo:build-task', 1000], ['agent-b', 'exo:review-branch', 2000], ['agent-c', 'exo:fix-review', 4000]]);
  const phases = buildPhases(main);
  assert.deepEqual(phases, {
    setup: 10,
    wave: 20 + 30 + 40,
    subagents: 1000,
    landing: 50 + 60,
    verify: 70 + 80 + 90 + 100,
    retries: 110 + 120,
    review: 2000,
    fix: 4000,
    other: 130
  });
  const total = sumCounts(Object.values(transcriptCalls(main))).weightedInput + sumCounts(Object.values(transcriptCalls(main))).output;
  assert.equal(Object.values(phases).reduce((sum, value) => sum + value, 0), total);
});

test('a landing call ends a wave whose notification never arrives', () => {
  const build = assistant('m2', 20, dispatch('exo:build-task'));
  const main = transcript([assistant('m1', 10), build, assistant('m3', 30), assistant('m4', 40, bash('git worktree remove ../x')), assistant('m5', 50)], []);
  const phases = buildPhases(main);
  assert.equal(phases.wave, 50);
  assert.equal(phases.landing, 40);
  assert.equal(phases.other, 50);
});

test('the mean averages each phase over the cells', () => {
  const zero = Object.fromEntries(PHASES.map((name) => [name, 0]));
  const mean = meanPhases([{ ...zero, setup: 10 }, { ...zero, setup: 30, fix: 4 }]);
  assert.equal(mean.setup, 20);
  assert.equal(mean.fix, 2);
});
