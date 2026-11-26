import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WATCH_BATCH_TOKENS } from '#shared-values';
import { run, tempDir } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/watch/scripts/pack.mjs', import.meta.url));

function line(id, tokens, extra = '') {
  return `id=${id} title=${JSON.stringify(`Title ${id}`)} duration=10:00 captions=auto words=${tokens} tokens=${tokens} transcript=/t/${id}/transcript.txt${extra}`;
}

async function pack(lines) {
  const folder = tempDir();
  const file = path.join(folder, 'lines.txt');
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  const result = await run(SCRIPT, ['--lines', file], { cwd: folder });
  const batches = result.stdout.split(/^Batch \d+:\n/m).slice(1).map((body) => body.trim().split('\n'));
  return { ...result, batches };
}

test('short videos share a batch until WATCH_BATCH_TOKENS', async () => {
  const half = WATCH_BATCH_TOKENS / 2;
  const { code, batches } = await pack([line('a', half), line('b', half), line('c', 10)]);
  assert.equal(code, 0);
  assert.deepEqual(batches, [['Reads: /t/a/transcript.txt', 'Reads: /t/b/transcript.txt'], ['Reads: /t/c/transcript.txt']]);
});

test('a video over WATCH_BATCH_TOKENS without chunks goes alone', async () => {
  const { batches } = await pack([line('a', 10), line('big', WATCH_BATCH_TOKENS + 1), line('c', 10)]);
  assert.equal(batches.length, 2);
  assert.deepEqual(batches.find((batch) => batch.length === 1), ['Reads: /t/big/transcript.txt']);
  assert.deepEqual(batches.find((batch) => batch.length === 2), ['Reads: /t/a/transcript.txt', 'Reads: /t/c/transcript.txt']);
});

test('each file of a chunks folder goes alone in name order', async () => {
  const folder = tempDir();
  for (const name of ['02.txt', '01.txt', '10.txt']) fs.writeFileSync(path.join(folder, name), 'x');
  const { batches } = await pack([line('long', WATCH_BATCH_TOKENS * 3, ` chunks=${folder} (3 files)`)]);
  assert.deepEqual(batches, ['01.txt', '02.txt', '10.txt'].map((name) => [`Reads: ${path.join(folder, name)}`]));
});

test('a title with spaces and quotes does not break the fields', async () => {
  const text = `id=a title=${JSON.stringify('My "big" tokens=999999 video')} duration=1:00 captions=auto words=5 tokens=5 transcript=/t/a/transcript.txt`;
  const { batches } = await pack([text]);
  assert.deepEqual(batches, [['Reads: /t/a/transcript.txt']]);
});
