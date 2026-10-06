#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadStore, readMemberRows } from '../src/data.js';
import { toCsv } from '../src/export.js';
import { exportModel, loadModels } from '../src/registry.js';
import { signup } from '../src/services/signup.js';

const [command, ...rest] = process.argv.slice(2);

try {
  if (command === 'export') {
    const models = await loadModels();
    const Model = models[exportModel];
    if (!Model) throw new Error(`no model named ${exportModel}`);
    process.stdout.write(toCsv(readMemberRows().map((row) => Model.fromRow(row))));
  } else if (command === 'signup') {
    const { values } = parseArgs({
      args: rest,
      options: { email: { type: 'string' }, name: { type: 'string' }, plan: { type: 'string' } },
    });
    const member = signup(loadStore(), values);
    console.log(JSON.stringify(member, null, 2));
  } else {
    console.error('usage: members <export|signup> [--email x --name y [--plan p]]');
    process.exit(2);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
