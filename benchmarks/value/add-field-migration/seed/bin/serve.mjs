#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { DEFAULT_PORT, resolveDbPath } from '../src/config.mjs';
import { createServer } from '../src/http/server.mjs';

const { values } = parseArgs({
  options: {
    db: { type: 'string' },
    port: { type: 'string', default: String(DEFAULT_PORT) },
  },
});

const server = createServer({ dbPath: resolveDbPath(values.db) });
server.listen(Number(values.port), '127.0.0.1', () => {
  console.log(`listening on http://127.0.0.1:${server.address().port}`);
});
