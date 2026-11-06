import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { agentHook } from '../hooks/agent-effort.mjs';
import { workerSize } from '../lib/worker-size.mjs';
import { tempDir } from './harness.mjs';

const SESSION = '00000000-0000-0000-0000-000000000000';
const SLUG = '-Users-example-code-app';

function png(width, height, bytes) {
  const buffer = Buffer.alloc(bytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).copy(buffer);
  buffer.write('IHDR', 12, 'latin1');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function gif(width, height) {
  const buffer = Buffer.alloc(40);
  buffer.write('GIF89a', 0, 'latin1');
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

function jpeg(width, height) {
  const buffer = Buffer.alloc(40);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8]).copy(buffer);
  buffer.writeUInt16BE(height, 13);
  buffer.writeUInt16BE(width, 15);
  return buffer;
}

function webp(width, height) {
  const buffer = Buffer.alloc(40);
  buffer.write('RIFF', 0, 'latin1');
  buffer.write('WEBPVP8X', 8, 'latin1');
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

function project() {
  const root = tempDir('read-estimate-');
  const cwd = path.join(root, 'app');
  const images = path.join(root, `claude-${process.getuid()}`, SLUG, SESSION, 'images');
  fs.mkdirSync(cwd);
  fs.mkdirSync(images, { recursive: true });
  process.env.TMPDIR = root;
  return { cwd, images, session: { session_id: SESSION, cwd } };
}

const brief = (reads) => `Reads: ${reads}\nResult: .exo/r.md`;

test('a bare pasted image name resolves from the session images directory', () => {
  const { cwd, images, session } = project();
  fs.writeFileSync(path.join(images, '17.png'), png(800, 600, 32466));
  const size = workerSize({ prompt: brief('17.png'), cwd, session });
  assert.deepEqual(size.unresolved, []);
  assert.equal(size.tokens, 640);
});

test('png, jpeg, gif and webp are sized from the header pixels', () => {
  const { cwd, images, session } = project();
  fs.writeFileSync(path.join(images, 'a.png'), png(750, 400, 9000));
  fs.writeFileSync(path.join(images, 'b.jpg'), jpeg(750, 400));
  fs.writeFileSync(path.join(images, 'c.gif'), gif(750, 400));
  fs.writeFileSync(path.join(images, 'd.webp'), webp(750, 400));
  for (const name of ['a.png', 'b.jpg', 'c.gif', 'd.webp']) {
    assert.equal(workerSize({ prompt: brief(name), cwd, session }).tokens, 400, name);
  }
});

test('a large image is scaled to 1568 pixels and capped at 1600 tokens', () => {
  const { cwd, images, session } = project();
  fs.writeFileSync(path.join(images, '20.png'), png(2940, 1912, 182032));
  assert.equal(workerSize({ prompt: brief('20.png'), cwd, session }).tokens, 1600);
});

test('a pdf costs its page count and other binary files a flat amount', () => {
  const { cwd, session } = project();
  fs.writeFileSync(path.join(cwd, 'a.pdf'), '%PDF-1.4\n<< /Type /Page >>\n<< /Type /Page >>\n<< /Type /Pages /Count 2 >>\n');
  fs.writeFileSync(path.join(cwd, 'b.bin'), Buffer.alloc(100000));
  assert.equal(workerSize({ prompt: brief('a.pdf'), cwd, session }).tokens, 6000);
  assert.equal(workerSize({ prompt: brief('b.bin'), cwd, session }).tokens, 500);
});

test('text still costs two bytes per token', () => {
  const { cwd, session } = project();
  fs.writeFileSync(path.join(cwd, 'a.txt'), 'x'.repeat(2000));
  assert.equal(workerSize({ prompt: brief('a.txt'), cwd, session }).tokens, 1000);
});

function denial(prompt, cwd, session) {
  const tool_input = { subagent_type: 'general-purpose', description: 'work', prompt };
  const out = agentHook({ tool_name: 'Agent', cwd, tool_input, ...session }, 'on', () => false)?.hookSpecificOutput;
  return out?.permissionDecisionReason ?? JSON.stringify(out);
}

test('a missing path names the directories searched and the full-path advice', () => {
  const { cwd, session } = project();
  const reason = denial(brief('99.png'), cwd, session);
  assert.match(reason, /99\.png/);
  assert.match(reason, /searched .*images/);
  assert.match(reason, /full path/);
});

test('an over-budget denial names the tokens to cut and the largest reads', () => {
  const { cwd, session } = project();
  fs.writeFileSync(path.join(cwd, 'big.txt'), 'x'.repeat(80000));
  const reason = denial(brief('big.txt'), cwd, session);
  assert.match(reason, /cut at least 10000 tokens/);
  assert.match(reason, /big\.txt \(40000\)/);
  assert.match(reason, /budget of 30000/);
});
