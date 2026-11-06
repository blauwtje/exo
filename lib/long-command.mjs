import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function saveLongCommand(command, cwd) {
  const hash = createHash('sha256').update(command).digest('hex').slice(0, 12);
  const relative = `.exo/long-command-${hash}.sh`;
  try {
    fs.mkdirSync(path.join(cwd, '.exo'), { recursive: true });
    fs.writeFileSync(path.join(cwd, relative), command);
    return relative;
  } catch {
    return null;
  }
}
