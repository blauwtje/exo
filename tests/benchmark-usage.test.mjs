// A benchmark cell's usage.json sums every transcript of its session, the main
// thread and each subagent, because the result JSON's usage block holds the
// main thread only; backfill-usage.mjs writes it for cells from older runs.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const BACKFILL = fileURLToPath(new URL('../benchmarks/backfill-usage.mjs', import.meta.url));
const SESSION_ID = '11111111-2222-3333-4444-555555555555';

function assistant(id, model, usage) {
  return { type: 'assistant', uuid: `u-${id}`, timestamp: '2026-09-11T10:00:00.000Z', message: { id, model, role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage } };
}

function usage(input, cacheRead, cache1h, cache5m, output) {
  return { input_tokens: input, cache_read_input_tokens: cacheRead, output_tokens: output, cache_creation: { ephemeral_1h_input_tokens: cache1h, ephemeral_5m_input_tokens: cache5m } };
}

async function writeLines(file, entries) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
}

function runBackfill(runsDirectory, configDirectory) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BACKFILL, runsDirectory], { env: { ...process.env, CLAUDE_CONFIG_DIR: configDirectory }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}

test('backfill writes usage.json with the main thread and every subagent', async () => {
  const configDirectory = await fixture();
  const project = path.join(configDirectory, 'projects', '-tmp-exo-bench-t1');
  const hookContext = { type: 'attachment', uuid: 'h1', timestamp: '2026-09-11T09:59:59.000Z', attachment: { type: 'hook_additional_context', content: ['# Using exo\n\n# Right-sizing\n\n## The ladder\n\nRead first.'] } };
  await writeLines(path.join(project, `${SESSION_ID}.jsonl`), [
    hookContext,
    assistant('msg_main_1', 'claude-haiku-4-5-20251001', usage(10, 0, 1000, 0, 20)),
    assistant('msg_main_1', 'claude-haiku-4-5-20251001', usage(10, 0, 1000, 0, 50)),
    assistant('msg_main_2', 'claude-haiku-4-5-20251001', usage(5, 1000, 0, 0, 30))
  ]);
  const subagents = path.join(project, SESSION_ID, 'subagents');
  await writeLines(path.join(subagents, 'agent-a1.jsonl'), [assistant('msg_sub_1', 'claude-sonnet-5', usage(3, 0, 0, 400, 40))]);
  await fs.writeFile(path.join(subagents, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'exo:codebase-scout' }));

  const runs = await fixture();
  const cell = path.join(runs, 't1', 'exo', '1');
  await fs.mkdir(cell, { recursive: true });
  await fs.writeFile(path.join(cell, 'result.json'), JSON.stringify({ session_id: SESSION_ID }));
  const orphan = path.join(runs, 't1', 'baseline', '1');
  await fs.mkdir(orphan, { recursive: true });
  await fs.writeFile(path.join(orphan, 'result.json'), JSON.stringify({ session_id: '99999999-2222-3333-4444-555555555555' }));

  const result = await runBackfill(runs, configDirectory);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /usage\.json written for 1 cells/);
  assert.match(result.stdout, /no transcript left for 1 cells: t1\/baseline\/1/);
  const written = JSON.parse(await fs.readFile(path.join(cell, 'usage.json'), 'utf8'));
  // The streamed msg_main_1 counts once, at its last output; the subagent adds its own line.
  assert.deepEqual(
    { input: written.counts.input, cacheRead: written.counts.cacheRead, cache1h: written.counts.cache1h, cache5m: written.counts.cache5m, output: written.counts.output },
    { input: 18, cacheRead: 1000, cache1h: 1000, cache5m: 400, output: 120 }
  );
  assert.equal(written.counts.weightedInput, 18 + 100 + 2000 + 500);
  assert.deepEqual(Object.keys(written.byModel).sort(), ['claude-haiku-4-5-20251001', 'claude-sonnet-5']);
  assert.equal(written.byModel['claude-sonnet-5'].output, 40);
  assert.deepEqual(written.subagents, ['exo:codebase-scout']);
  assert.equal(written.ladder, true);
  await assert.rejects(fs.access(path.join(orphan, 'usage.json')));
});
