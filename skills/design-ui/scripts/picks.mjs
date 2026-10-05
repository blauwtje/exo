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
// that family (in either role) or a near accent. An accent is near when close in
// OKLCH under NEAR_ACCENT; an unparseable accent matches only the same string.
// The caller writes the warning, in the reply's language; this script only counts.
// Exit 2 is a usage error; exit 1 means the log is unreadable and is left untouched.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { isMain, parseFlags, UsageError } from '#script-flags';
import { oklchOf } from './check-ui.mjs';
import { normalizeFamily } from './overused-fonts.mjs';

// How close another project's accent sits in OKLCH to count as a repeat: the hue gap in degrees when both are
// chromatic, and the lightness gap on a 0-1 scale. Below `chroma` an accent is a near-grey, whose hue means
// nothing, so two near-greys match on lightness alone.
const NEAR_ACCENT = Object.freeze({ hue: 20, lightness: 0.12, chroma: 0.05 });

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

/** Whether two stored accents read as the same pick: near in OKLCH, or the same string when either is unparseable. */
function nearAccent(first, second) {
  const a = oklchOf(first);
  const b = oklchOf(second);
  if (!a || !b) return first === second;
  if (Math.abs(a.lightness - b.lightness) > NEAR_ACCENT.lightness) return false;
  const aGrey = a.chroma < NEAR_ACCENT.chroma;
  const bGrey = b.chroma < NEAR_ACCENT.chroma;
  if (aGrey || bGrey) return aGrey && bGrey;
  const gap = Math.abs(a.hue - b.hue);
  return Math.min(gap, 360 - gap) <= NEAR_ACCENT.hue;
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
    accent: others.filter((other) => nearAccent(String(other.accent ?? ''), entry.accent)).length
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
