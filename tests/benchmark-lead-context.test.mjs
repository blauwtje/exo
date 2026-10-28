import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { contextSeries } from '#context-limits';
import { fixture, run } from './harness.mjs';

const TOOL = path.resolve('benchmarks/lead-context.mjs');

const skill = (name) => ({ name: 'Skill', input: { skill: name } });
const agent = (type) => ({ name: 'Agent', input: { subagent_type: type } });
const bash = (command) => ({ name: 'Bash', input: { command } });

function turn(tokens, call) {
  const content = call ? [{ type: 'tool_use', id: 'toolu_1', ...call }] : [{ type: 'text', text: 'ok' }];
  const usage = { input_tokens: 1000, cache_read_input_tokens: tokens - 2000, cache_creation_input_tokens: 1000 };
  return { type: 'assistant', message: { content, usage } };
}

const boundary = (preTokens) => ({ type: 'system', subtype: 'compact_boundary', compactMetadata: { preTokens } });

const LEAD = [
  turn(10_000, skill('exo:spec')),
  turn(40_000, bash('cd x && node "$ROOT/skills/build/scripts/next-task.mjs" --plan p')),
  turn(50_000, agent('exo:run-unit')),
  turn(70_000, bash('cat skills/build/scripts/merge-reviews.mjs')),
  turn(90_000, bash('node skills/build/scripts/merge-reviews.mjs --plan p')),
  boundary(90_000),
  turn(20_000, bash('node skills/build/scripts/merge-reviews.mjs --plan p')),
  turn(40_000)
];
const SMALL = [turn(9_000, bash('ls'))];

async function transcripts() {
  const folder = await fixture();
  const write = (name, entries) => fs.writeFile(path.join(folder, name), `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  await write('lead.jsonl', LEAD);
  await write('small.jsonl', SMALL);
  await fs.mkdir(path.join(folder, 'lead', 'subagents'), { recursive: true });
  await write(path.join('lead', 'subagents', 'agent-a1.jsonl'), [turn(95_000)]);
  return folder;
}

test('contextSeries yields the summed tokens of each assistant turn with its entry', async () => {
  const folder = await transcripts();
  const series = contextSeries(path.join(folder, 'lead.jsonl')).filter((turn) => turn.tokens !== null);
  assert.deepEqual(series.map((turn) => turn.tokens), [10_000, 40_000, 50_000, 70_000, 90_000, 20_000, 40_000]);
  assert.equal(series[0].entry.message.content[0].input.skill, 'exo:spec');
});

test('a stage call that is not the last block of a split assistant message still gets the growth', async () => {
  const folder = await fixture();
  const split = (id, call) => ({ ...turn(50_000, call), message: { ...turn(50_000, call).message, id } });
  const entries = [split('msg_1', agent('exo:run-unit')), split('msg_1', bash('ls')), turn(70_000)];
  await fs.writeFile(path.join(folder, 's.jsonl'), `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  const result = await run(TOOL, ['--folder', folder, '--all']);
  assert.match(result.stdout, /^session s .*unit 100%/m);
});

test('--help prints the usage and exits 0', async () => {
  const result = await run(TOOL, ['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /--folder/);
  assert.match(result.stdout, /--all/);
});

test('the default lists sessions at or above 60k with peak, turns past each limit, compactions and stage shares', async () => {
  const folder = await transcripts();
  const result = await run(TOOL, ['--folder', folder]);
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  const session = lines.find((line) => line.startsWith('session lead'));
  assert.ok(session, result.stdout);
  assert.match(session, /peak 90000/);
  assert.match(session, /turns>=60k 2/);
  assert.match(session, /turns>=80k 1/);
  assert.match(session, /compactions 90000/);
  assert.match(session, /spec 30%.*next-task 10%.*unit 20%.*merge-reviews 20%.*other 20%/);
  assert.equal(lines.some((line) => line.startsWith('session small')), false);
  assert.match(lines.find((line) => line.startsWith('totals')), /sessions 2.*listed 1/);
  assert.match(lines.find((line) => line.startsWith('shares')), /spec 30%.*next-task 10%.*unit 20%.*merge-reviews 20%.*other 20%/);
});

test('--all lists every session', async () => {
  const folder = await transcripts();
  const result = await run(TOOL, ['--folder', folder, '--all']);
  assert.match(result.stdout, /^session small peak 9000/m);
  assert.match(result.stdout, /^session lead peak 90000/m);
});

test('a missing folder exits 2 naming --folder', async () => {
  const result = await run(TOOL, ['--folder', path.join(await fixture(), 'absent')]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--folder/);
});
