import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { extraReads, sessionReads } from '../benchmarks/lead-reads.mjs';
import { tempDir } from './harness.mjs';

const RESULTS = path.resolve('benchmarks/results/2026-11-10-nofork-main-reads.md');

function turn(tokens, id, calls) {
  const content = calls.map((call, index) => ({ type: 'tool_use', id: `${id}-${index}`, ...call }));
  const usage = { input_tokens: 1000, cache_read_input_tokens: tokens - 2000, cache_creation_input_tokens: 1000 };
  return { type: 'assistant', message: { id, content, usage } };
}

const result = (id, text) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] } });

function session(entries) {
  const file = path.join(tempDir('exo-reads-'), 's.jsonl');
  fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  return file;
}

const read = (file) => ({ name: 'Read', input: { file_path: file } });

test('the growth after a turn is split among its calls by result size', () => {
  const file = session([
    turn(10_000, 'm1', [read('/a.md'), read('/b.md')]),
    result('m1-0', 'x'.repeat(298)),
    result('m1-1', 'x'.repeat(98)),
    turn(14_000, 'm2', [])
  ]);
  assert.deepEqual(sessionReads(file), [{ label: '/a.md', tokens: 3000 }, { label: '/b.md', tokens: 1000 }]);
});

test('a read only the first session makes is extra and one both make is not', () => {
  const both = read('/both.md');
  const first = session([turn(10_000, 'm1', [both, read('/only.md')]), turn(12_000, 'm2', [])]);
  const second = session([turn(10_000, 'm1', [both]), turn(12_000, 'm2', [])]);
  const extra = extraReads([first], [second]);
  assert.deepEqual(extra.map((item) => item.label), ['/only.md']);
});

test('a skill file path in a command is the label, whatever the temp folder', () => {
  const command = (folder) => ({ name: 'Bash', input: { command: `cat /var/folders/ab/cd/T/exo-sweep-${folder}/skills/build/references/run-loop.md` } });
  const first = session([turn(10_000, 'm1', [command('one')]), turn(12_000, 'm2', [])]);
  const second = session([turn(10_000, 'm1', [command('two')]), turn(12_000, 'm2', [])]);
  assert.deepEqual(extraReads([first], [second]), []);
});

test('the results file lists each extra read with a token count', () => {
  const lines = fs.readFileSync(RESULTS, 'utf8').split('\n').filter((line) => line.startsWith('Read: '));
  assert.ok(lines.length > 0);
  for (const line of lines) assert.match(line, /^Read: .+ \d+ \(\d+\/13 sessions\)$/);
  assert.ok(lines.some((line) => line.includes('skills/build/references/run-loop.md')));
});
