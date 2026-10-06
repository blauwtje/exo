#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveDbPath } from '../src/config.mjs';
import * as create from '../src/cli/commands/create.mjs';
import * as list from '../src/cli/commands/list.mjs';
import * as migrate from '../src/cli/commands/migrate.mjs';
import * as show from '../src/cli/commands/show.mjs';

const COMMANDS = { create, list, migrate, show };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    db: { type: 'string' },
    account: { type: 'string' },
    line: { type: 'string', multiple: true },
    due: { type: 'string' },
    note: { type: 'string' },
  },
});

const [name, ...rest] = positionals;
const command = COMMANDS[name];
if (!command) {
  console.error(`usage: cli <${Object.keys(COMMANDS).join('|')}> [--db file]`);
  process.exit(2);
}

try {
  await command.run({ dbPath: resolveDbPath(values.db), values, positionals: rest });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
