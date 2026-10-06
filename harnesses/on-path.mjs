// Whether a command is on the PATH that `env` carries, for an adapter's detect().
// Only a regular file counts, and an empty PATH entry is skipped rather than read
// as the working directory. On Windows each name is tried with every extension in
// PATHEXT (default `.EXE;.CMD;.BAT`), and the bare name is not.

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
