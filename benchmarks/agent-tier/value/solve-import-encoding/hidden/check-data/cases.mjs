import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

const bytes = (...parts) => Readable.from(parts.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part))));

async function collect(readLines, source) {
  const lines = [];
  for await (const line of readLines(source)) lines.push(line);
  return lines;
}

export const cases = [
  {
    name: 'a multibyte character split across two chunks survives',
    run: async ({ load }) => {
      const { readLines } = await load('src/lines.mjs');
      const whole = Buffer.from('Zoë,zoe@example.com\nJosé,jose@example.com\n', 'utf8');
      for (let cut = 1; cut < whole.length; cut += 1) {
        const lines = await collect(readLines, bytes(whole.subarray(0, cut), whole.subarray(cut)));
        assert.deepEqual(lines, ['Zoë,zoe@example.com', 'José,jose@example.com'], `cut at ${cut}`);
      }
    }
  },
  {
    name: 'one byte per chunk still decodes a whole file',
    run: async ({ load }) => {
      const { importUsers } = await load('src/import.mjs');
      const whole = Buffer.from('name,email\nÅsa,asa@example.com\n李雷,lilei@example.com\n', 'utf8');
      const users = await importUsers(bytes(...Array.from(whole, (byte) => Buffer.from([byte]))));
      assert.deepEqual(users.map((user) => user.name), ['Åsa', '李雷']);
    }
  },
  {
    name: 'a UTF-8 byte order mark does not hide the first column',
    run: async ({ load }) => {
      const { importUsers } = await load('src/import.mjs');
      const users = await importUsers(bytes(Buffer.from([0xef, 0xbb, 0xbf]), 'email,name\nann@example.com,Ann\n'));
      assert.deepEqual(users, [{ email: 'ann@example.com', name: 'Ann' }]);
      const split = await importUsers(bytes(Buffer.from([0xef]), Buffer.from([0xbb, 0xbf]), 'email,name\nann@example.com,Ann\n'));
      assert.deepEqual(split, [{ email: 'ann@example.com', name: 'Ann' }]);
    }
  },
  {
    name: 'CRLF line ends leave no carriage return in the last column',
    run: async ({ load }) => {
      const { importUsers } = await load('src/import.mjs');
      const users = await importUsers(bytes('name,email\r\nAnn,ann@example.com\r\nBob,bob@example.com\r\n'));
      assert.deepEqual(users, [{ name: 'Ann', email: 'ann@example.com' }, { name: 'Bob', email: 'bob@example.com' }]);
    }
  },
  {
    name: 'a spreadsheet export with BOM, CRLF and accents imports in full',
    run: async ({ load }) => {
      const { importUsers } = await load('src/import.mjs');
      const text = '﻿email,name\r\nrené@example.com,René\r\nmaría@example.com,María\r\n';
      const whole = Buffer.from(text, 'utf8');
      const users = await importUsers(bytes(whole.subarray(0, 20), whole.subarray(20, 47), whole.subarray(47)));
      assert.deepEqual(users, [{ email: 'rené@example.com', name: 'René' }, { email: 'maría@example.com', name: 'María' }]);
    }
  },
  {
    name: 'a file without a trailing newline keeps its last line',
    run: async ({ load }) => {
      const { importUsers } = await load('src/import.mjs');
      const users = await importUsers(bytes('name,email\nAnn,ann@example.com'));
      assert.deepEqual(users, [{ name: 'Ann', email: 'ann@example.com' }]);
    }
  }
];
