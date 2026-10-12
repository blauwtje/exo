import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { isMain, parseFlags, UsageError } from '#script-flags';
import { oklchOf } from './check-ui.mjs';
import { normalizeFamily } from './overused-fonts.mjs';

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

export function picksLine(picks, counts) {
  const shown = (value) => String(value).trim().replace(/^(["'])(.*)\1$/, '$2');
  const repeat = (count) => {
    if (count === 0) return '';
    return ` (also used in ${count} earlier ${count === 1 ? 'project' : 'projects'})`;
  };
  return [
    `Accent ${shown(picks.accent)}${repeat(counts.accent)}`,
    `display ${shown(picks.display)}${repeat(counts.display)}`,
    `body ${shown(picks.body)}${repeat(counts.body)}`
  ].join(', ');
}

const USAGE = `Usage:
  node scripts/picks.mjs --project <root> --display <family> --body <family> --accent <color>
`;

function main(argv) {
  const flags = parseFlags(argv, { project: 'string', display: 'string', body: 'string', accent: 'string' }, { usage: USAGE });
  for (const name of ['project', 'display', 'body', 'accent']) {
    if (!flags[name]?.trim()) throw new UsageError(`--${name} is required`);
  }
  const counts = recordPicks(flags.project, flags);
  process.stdout.write(`${picksLine(flags, counts)}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`ui-design: ${error.message}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
