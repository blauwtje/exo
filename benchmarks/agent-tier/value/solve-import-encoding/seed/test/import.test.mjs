import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { importUsers } from '../src/import.mjs';
import { readLines } from '../src/lines.mjs';

const stream = (...parts) => Readable.from(parts.map((part) => Buffer.from(part)));

test('importUsers reads a plain file', async () => {
  const users = await importUsers(stream('name,email\nAnn,ann@example.com\nBob,bob@example.com\n'));
  assert.deepEqual(users, [{ name: 'Ann', email: 'ann@example.com' }, { name: 'Bob', email: 'bob@example.com' }]);
});

test('importUsers rejects a file without an email column', async () => {
  await assert.rejects(importUsers(stream('name,phone\nAnn,1\n')), /missing column: email/);
});

test('readLines joins a line split across chunks', async () => {
  const lines = [];
  for await (const line of readLines(stream('ab', 'c\nd', 'ef\n'))) lines.push(line);
  assert.deepEqual(lines, ['abc', 'def']);
});
