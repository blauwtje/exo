import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

const MIGRATION_FILE = /^\d+_[a-z0-9_]+\.mjs$/;

export function listMigrations(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir)
    .filter((file) => MIGRATION_FILE.test(file))
    .sort()
    .map((file) => ({ name: file.slice(0, -'.mjs'.length), file: path.join(dir, file) }));
}

export function checksumOf(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
