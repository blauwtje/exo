import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(new URL('../skills/learn/scripts/corrections.mjs', import.meta.url));

test('a hook whose input arrives after it started still stores its row', async () => {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-stdin-'));
  const project = path.join(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'learn.stdin_x-')), 'app');
  fs.mkdirSync(project, { recursive: true });
  const started = path.join(config, 'started');
  const preload = path.join(config, 'preload.mjs');
  fs.writeFileSync(preload, `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(started)}, '');\n`);
  const child = spawn('node', ['--import', pathToFileURL(preload).href, script, 'hook'], { env: { ...process.env, CLAUDE_CONFIG_DIR: config }, stdio: ['pipe', 'ignore', 'ignore'] });
  const closed = new Promise((resolve) => child.on('close', resolve));
  while (!fs.existsSync(started)) await new Promise(setImmediate);
  child.stdin.end(JSON.stringify({ session_id: 'late', prompt: 'hello late world', cwd: project }));
  await closed;
  const files = fs.readdirSync(path.join(config, 'exo', 'learn')).filter((name) => /^[A-Za-z0-9-]+\.jsonl$/.test(name));
  assert.equal(files.length, 1);
  assert.match(fs.readFileSync(path.join(config, 'exo', 'learn', files[0]), 'utf8'), /"seen":"late"/);
});
