import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { openSlots } from '../skills/build/scripts/open-slots.mjs';
import { gitRepository } from './harness.mjs';

const listen = (port) => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => resolve(server));
});

const SETUP = 'echo "$EXO_SLOT $EXO_PORT_BASE $EXO_STATE_DIR" > .exo/setup-env.txt';

async function openTwo(env = {}) {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  const previous = process.env.EXO_SLOT_PORT_START;
  if (env.EXO_SLOT_PORT_START) process.env.EXO_SLOT_PORT_START = env.EXO_SLOT_PORT_START;
  try {
    const opened = openSlots({ root, numbers: [1, 2], setup: SETUP, fresh: true, since: 0 });
    assert.equal(opened.reason, undefined);
    return opened;
  } finally {
    if (previous === undefined) delete process.env.EXO_SLOT_PORT_START;
    else process.env.EXO_SLOT_PORT_START = previous;
  }
}

const seen = async (slot) => (await fs.readFile(path.join(slot, '.exo', 'setup-env.txt'), 'utf8')).trim().split(' ');

test('parallel slots each bind a server on their own EXO_PORT_BASE', async () => {
  const opened = await openTwo({ EXO_SLOT_PORT_START: '47100' });
  const [first, second] = await Promise.all([seen(opened.records[1].slot), seen(opened.records[2].slot)]);
  assert.deepEqual([first[0], second[0]], ['0', '1']);
  assert.deepEqual([first[1], second[1]], ['47100', '47110']);
  assert.notEqual(first[2], second[2]);
  const servers = await Promise.all([listen(Number(first[1])), listen(Number(second[1]))]);
  servers.forEach((server) => server.close());
});

test('a slot writes its variables to .exo/slot.env for the proof commands', async () => {
  const opened = await openTwo();
  const text = await fs.readFile(path.join(opened.records[2].slot, '.exo', 'slot.env'), 'utf8');
  assert.match(text, /export EXO_SLOT="1"/);
  assert.match(text, /export EXO_PORT_BASE="42010"/);
  assert.match(text, /export EXO_STATE_DIR=".*slot-state.1"/);
});

test('a slot gets the main checkout .env and leaves it ignored', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n', '.gitignore': '.env\n' });
  await fs.writeFile(path.join(root, '.env'), 'MADE_UP=value\n');
  const opened = openSlots({ root, numbers: [1], setup: 'true', fresh: true, since: 0 });
  assert.equal(opened.reason, undefined);
  const copied = await fs.readFile(path.join(opened.records[1].slot, '.env'), 'utf8');
  assert.equal(copied, 'MADE_UP=value\n');
});

test('a plan input under .exo/ stays out of the slot, so landing the slot never copies stale run state back', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n', '.gitignore': '.exo/\n' });
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo', 'window.json'), '{"2":{"base":"stale"}}');
  const opened = openSlots({ root, numbers: [1], setup: 'true', inputs: ['.exo/window.json'], fresh: true, since: 0 });
  assert.equal(opened.reason, undefined);
  await assert.rejects(fs.access(path.join(opened.records[1].slot, '.exo', 'window.json')));
});
