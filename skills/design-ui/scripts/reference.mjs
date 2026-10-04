// The product a user last picked in the design-ui form as the look to resemble,
// kept per user so the next run's form offers it first.
//
//   node scripts/reference.mjs               prints the saved product, or nothing
//   node scripts/reference.mjs --set <name>  saves <name> as the new default

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isMain } from '#script-flags';

export function referenceFile(environment = process.env) {
  const configDirectory = environment.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(configDirectory, 'exo', 'design-ui.json');
}

function readSettings(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function savedReference(file = referenceFile()) {
  const { reference } = readSettings(file);
  return typeof reference === 'string' ? reference : '';
}

export function saveReference(name, file = referenceFile()) {
  const reference = name.trim();
  if (!reference) throw new Error('--set needs a product name');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ ...readSettings(file), reference }, null, 2)}\n`);
  return reference;
}

if (isMain(import.meta.url)) {
  const [flag, name] = process.argv.slice(2);
  try {
    if (flag === '--set') console.log(`saved: ${saveReference(name ?? '')}`);
    else if (flag === undefined) console.log(savedReference());
    else throw new Error(`unknown argument: ${flag}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
