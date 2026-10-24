import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export class UsageError extends Error {}

export function parseFlags(argv, spec, { usage } = {}) {
  if (usage !== undefined && argv.includes('--help')) {
    process.stdout.write(usage.endsWith('\n') ? usage : `${usage}\n`);
    process.exit(0);
  }
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new UsageError(`unexpected argument '${token}'`);
    const name = token.slice(2);
    const kind = spec[name];
    if (!kind) throw new UsageError(`unknown flag '${token}'`);
    if (kind === 'boolean') {
      values[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`flag '${token}' needs a value`);
    }
    index += 1;
    if (kind === 'list') {
      (values[name] ??= []).push(value);
    } else {
      values[name] = value;
    }
  }
  return values;
}

export function environmentMs(name, fallback, env = process.env) {
  const text = env[name] ?? '';
  return /^[1-9]\d*$/.test(text) ? Number(text) : fallback;
}

export function isMain(moduleUrl) {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
