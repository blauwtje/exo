import { readdirSync } from 'node:fs';
import path from 'node:path';

export function relativeFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? relativeFiles(path.join(directory, entry.name), relative) : [relative];
  });
}

export function filesNamed(directory, name) {
  return readdirSync(directory, { recursive: true }).filter((file) => path.basename(file) === name);
}
