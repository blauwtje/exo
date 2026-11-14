
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function onPath(command, env) {
  const extensions = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const folder of (env.PATH ?? '').split(path.delimiter)) {
    if (folder === '') continue;
    for (const extension of extensions) {
      if (fs.statSync(path.join(folder, `${command}${extension}`), { throwIfNoEntry: false })?.isFile()) return true;
    }
  }
  return false;
}
