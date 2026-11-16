import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../skills/learn/scripts/corrections.mjs', import.meta.url));
const WRITE_DELAY_MS = 300;

test('a hook whose input arrives after it started still stores its row', async () => {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-stdin-'));
  const project = path.join(fs.realpathSync(os.tmpdir()), 'learn.stdin_x', 'app');
  fs.mkdirSync(project, { recursive: true });
  const child = spawn('node', [script, 'hook'], { env: { ...process.env, CLAUDE_CONFIG_DIR: config }, stdio: ['pipe', 'ignore', 'ignore'] });
  const closed = new Promise((resolve) => child.on('close', resolve));
  setTimeout(() => child.stdin.end(JSON.stringify({ session_id: 'late', prompt: 'hello late world', cwd: project })), WRITE_DELAY_MS);
  await closed;
  const files = fs.readdirSync(path.join(config, 'exo', 'learn')).filter((name) => name.endsWith('.jsonl'));
  assert.equal(files.length, 1);
  assert.match(fs.readFileSync(path.join(config, 'exo', 'learn', files[0]), 'utf8'), /"seen":"late"/);
});
