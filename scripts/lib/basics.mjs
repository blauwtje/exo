import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const isFile = (file) => fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true;

export function onPath(command, env = process.env) {
  const extensions = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  const folders = (env.PATH ?? '').split(path.delimiter).filter((folder) => folder !== '');
  return folders.some((folder) => extensions.some((extension) => isFile(path.join(folder, `${command}${extension}`))));
}
