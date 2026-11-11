import fs from 'node:fs';
import path from 'node:path';
import { SCRATCH_FOLDER } from '#scratch-path';
import { isFileOnDisk } from './run-session-claude.mjs';

export function reportLines(root, number) {
  const file = path.join(root, SCRATCH_FOLDER, `implementer-${number}.md`);
  if (!isFileOnDisk(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return ['Unresolved', 'Decision'].flatMap((label) => {
    const line = lines.find((entry) => new RegExp(`^(?:- )?${label}:`).test(entry));
    return line === undefined || /:\s*none\.?\s*$/i.test(line) ? [] : [`Task ${number} ${line.replace(/^- /, '')}`];
  });
}
