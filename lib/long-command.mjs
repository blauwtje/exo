import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function rootOf(cwd) {
  let directory = path.resolve(cwd);
  while (!fs.existsSync(path.join(directory, '.git'))) {
    const parent = path.dirname(directory);
    if (parent === directory) return cwd;
    directory = parent;
  }
  return directory;
}

export function saveLongCommand(command, cwd) {
  const hash = createHash('sha256').update(command).digest('hex').slice(0, 12);
  const directory = path.join(rootOf(cwd), '.exo');
  const file = path.join(directory, `long-command-${hash}.sh`);
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(file, command);
    return path.relative(cwd, file);
  } catch {
    return null;
  }
}
