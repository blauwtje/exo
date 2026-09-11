// calibrate.mjs sets the measured difference between exo and baseline
// calibration cells beside what overhead.mjs books from the exo cells' own
// transcripts, and says whether the error lies within the measured spread.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const CALIBRATE = fileURLToPath(new URL('../benchmarks/calibrate.mjs', import.meta.url));

function usage(cache1h) {
  return { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: cache1h, output_tokens: 20,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: cache1h } };
}

test('the booked overhead of the exo cells is compared with the measured difference of the arms', async () => {
  const root = await fixture();
  const configDirectory = await fixture();
  const listing = `- exo:${'x'.repeat(4037)}`;
  const wallMs = { baseline: [3000, 3000], exo: [3036, 3037] };
  for (const [arm, cache1h] of [['baseline', 5000], ['exo', 6000]]) {
    for (const run of [1, 2]) {
      const sessionId = `${arm}-${run}`;
      const cell = path.join(root, 'calib-reply', arm, String(run));
      await fs.mkdir(cell, { recursive: true });
      await fs.writeFile(path.join(cell, 'checks.json'), JSON.stringify({ tier: 'calibration', arm, wallMs: wallMs[arm][run - 1] }));
      await fs.writeFile(path.join(cell, 'result.json'), JSON.stringify({ session_id: sessionId, usage: usage(cache1h), total_cost_usd: 0.01, duration_ms: 3000 }));
      const transcript = path.join(configDirectory, 'projects', '-tmp-cell', `${sessionId}.jsonl`);
      await fs.mkdir(path.dirname(transcript), { recursive: true });
      const lines = [
        { type: 'attachment', timestamp: '2026-09-11T10:00:00.000Z', attachment: { type: 'skill_listing', content: arm === 'exo' ? listing : '- dataviz: Charts.' } },
        { type: 'assistant', uuid: 'a1', timestamp: '2026-09-11T10:00:03.000Z',
          message: { id: `msg_${sessionId}`, model: 'claude-haiku-4-5-20251001', usage: usage(cache1h), content: [{ type: 'text', text: 'ready' }] } }
      ];
      await fs.writeFile(transcript, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
    }
  }
  const result = await new Promise((resolve) => {
    execFile(process.execPath, [CALIBRATE, root], { env: { ...process.env, CLAUDE_CONFIG_DIR: configDirectory }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
  assert.equal(result.code, 0, result.stderr);
  // 4,043 listing characters are 1,000 tokens, written at the 1-hour weight: 2,000 booked, and 2 × 1,000 more cache writes measured.
  assert.match(result.stdout, /^\| tokens \| 2000 ± 0 \| 2000 \| 0 \| yes \|$/m);
  // 1,000 written tokens at 0.0368 ms each against a 36.5 ms wall-time difference.
  assert.match(result.stdout, /^\| time \| 37 ms ± 1 ms \| 37 ms \| 0 ms \| yes \|$/m);
  assert.match(result.stdout, /^Calibration: 2 exo and 2 baseline cells; calls counted whole: 0\.$/m);
});
