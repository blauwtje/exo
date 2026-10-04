// The machine-wide log of each project's font and accent picks, so a repeat
// across projects can be warned about. One JSON file at
// `<configDirectory()>/exo/design-picks.json`:
// {"version":1,"projects":{<absolute project root>:{"display":<family>,
// "body":<family>,"accent":<color>}}}. A project holds one entry; recording it
// again replaces it, so a rerun never counts against itself. Values are stored
// lowercase, single-spaced, unquoted. The counts below cover other projects only.
//
//   node scripts/picks.mjs --project <root> --display <family> --body <family> --accent <color>
//
// Records the project's picks, then prints one JSON line:
// {"display":<n>,"body":<n>,"accent":<n>}, n being how many other projects used
// that family (in either role) or that accent. The caller writes the warning, in
// the reply's language; this script only counts. Exit 2 is a usage error; exit 1
// means the log is unreadable and is left untouched, never overwritten.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { isMain, parseFlags, UsageError } from '#script-flags';
import { normalizeFamily } from './overused-fonts.mjs';

export function picksFile() {
  return path.join(configDirectory(), 'exo', 'design-picks.json');
}

function readLog(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, projects: {} };
    throw error;
  }
  const log = JSON.parse(text);
  if (log === null || typeof log.projects !== 'object' || log.projects === null) {
    throw new Error(`${file} is not a picks log`);
  }
  return log;
}

function writeLog(file, log) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(log, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

/** Record `picks` for `project` and return how many other projects made each pick. */
export function recordPicks(project, picks) {
  const file = picksFile();
  const log = readLog(file);
  const root = path.resolve(project);
  const entry = {
    display: normalizeFamily(picks.display),
    body: normalizeFamily(picks.body),
    accent: String(picks.accent ?? '').trim().toLowerCase()
  };
  const others = Object.entries(log.projects).filter(([key]) => key !== root).map(([, value]) => value);
  const usesFont = (other, family) => other.display === family || other.body === family;
  const counts = {
    display: others.filter((other) => usesFont(other, entry.display)).length,
    body: others.filter((other) => usesFont(other, entry.body)).length,
    accent: others.filter((other) => other.accent === entry.accent).length
  };
  log.projects[root] = entry;
  writeLog(file, log);
  return counts;
}

function main(argv) {
  const flags = parseFlags(argv, { project: 'string', display: 'string', body: 'string', accent: 'string' });
  for (const name of ['project', 'display', 'body', 'accent']) {
    if (!flags[name]?.trim()) throw new UsageError(`--${name} is required`);
  }
  const counts = recordPicks(flags.project, flags);
  process.stdout.write(`${JSON.stringify(counts)}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`ui-design: ${error.message}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
