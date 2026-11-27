import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function isMain(moduleUrl) {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
