// design-run.mjs reports what one designing run spent inside the window its run
// directory spans, and reports the transcript's other responses as excluded.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const DESIGN_RUN = fileURLToPath(new URL('../benchmarks/design-run.mjs', import.meta.url));

function assistant(id, timestamp, output) {
  return { type: 'assistant', uuid: `u-${id}`, timestamp, message: { id, model: 'claude-opus-5', role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: output } } };
}

async function writeLines(file, entries) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
}

function runDesignRun(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [DESIGN_RUN, ...args], { timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}

async function writeRun(root) {
  const run = path.join(root, 'run');
  await fs.mkdir(path.join(run, 'renders'), { recursive: true });
  const written = [
    ['context.json', '2026-09-11T10:00:30.000Z'],
    ['renders/baseline-390x844.png', '2026-09-11T10:02:00.000Z'],
    ['faults.md', '2026-09-11T10:04:00.000Z']
  ];
  for (const [relative, time] of written) {
    const file = path.join(run, relative);
    await fs.writeFile(file, 'x');
    await fs.utimes(file, new Date(time), new Date(time));
  }
  return run;
}

test('design-run counts only the responses inside the run window and reports the rest as excluded', async () => {
  const root = await fixture();
  const transcript = path.join(root, 'session.jsonl');
  await writeLines(transcript, [
    assistant('msg_before', '2026-09-11T10:00:00.000Z', 20),
    assistant('msg_inside', '2026-09-11T10:02:00.000Z', 30),
    assistant('msg_after', '2026-09-11T10:30:00.000Z', 50)
  ]);
  await writeLines(path.join(root, 'session', 'subagents', 'agent-a1.jsonl'), [
    assistant('msg_delegate', '2026-09-11T10:03:00.000Z', 40)
  ]);
  const run = await writeRun(root);

  const result = await runDesignRun(['--transcript', transcript, '--run', run]);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.window.start, '2026-09-11T10:00:30.000Z');
  assert.equal(report.window.end, '2026-09-11T10:04:00.000Z');
  assert.equal(report.wallMs, 210_000);
  assert.equal(report.responses, 2);
  assert.equal(report.counts.output, 70);
  assert.equal(report.excluded.responses, 2);
  assert.equal(report.excluded.counts.output, 70);
  assert.deepEqual(report.marks, [
    { checkpoint: 'context.json', atMs: 0 },
    { checkpoint: 'renders/baseline-', atMs: 90_000 },
    { checkpoint: 'faults.md', atMs: 210_000 }
  ]);
});

test('design-run fails when no response falls inside the run window', async () => {
  const root = await fixture();
  const transcript = path.join(root, 'other.jsonl');
  await writeLines(transcript, [assistant('msg_elsewhere', '2026-09-10T08:00:00.000Z', 20)]);
  const run = await writeRun(root);

  const result = await runDesignRun(['--transcript', transcript, '--run', run]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /no response in .* falls inside the run window/);
});

test('design-run prints its usage when an input is missing', async () => {
  const result = await runDesignRun(['--transcript', '/nonexistent.jsonl']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /usage: design-run\.mjs --transcript/);
});
