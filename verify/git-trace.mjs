import fs from 'node:fs';
import path from 'node:path';

function startEvent(file) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"event":"start"')) continue;
    return JSON.parse(line);
  }
  return null;
}

export function gitStarts(directory) {
  return fs.readdirSync(directory)
    .map((name) => startEvent(path.join(directory, name)))
    .filter((event) => event && !event.sid.includes('/'))
    .map(({ time, argv }) => ({ time, argv: ['git', ...argv.slice(1)] }))
    .sort((a, b) => a.time.localeCompare(b.time));
}
