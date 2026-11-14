import fs from 'node:fs';
import path from 'node:path';

const SCANNED = ['skills', 'agents', 'hooks', 'harnesses/codex/generated'];
const TEXT_FILE = /\.(?:md|mjs|json)$/;
const FOREGROUND = /\bforeground\b|run_in_background[`"']?\s*(?:[:=]|to|as)?\s*false\b|\bno `?run_in_background\b/i;
const DISPATCH = /\b(?:Agent|agents?|calls?|dispatch\w*|send|sends|sent)\b|exo:[\w-]+/i;
const SHELL = /\bBash\b|\btimeout\b|`node /i;

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && TEXT_FILE.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function forkedSkillFolders(repository) {
  return filesUnder(repository.join('skills'))
    .filter((file) => path.basename(file) === 'SKILL.md')
    .filter((file) => /^---\n(?:(?!---\n)[\s\S])*?^context:\s*fork\s*$/m.test(repository.text(file)))
    .map((file) => path.dirname(file) + path.sep);
}

function isForegroundDispatch(line) {
  return FOREGROUND.test(line) && DISPATCH.test(line) && !SHELL.test(line);
}

function isSkipped(file, forked) {
  return forked.some((folder) => file.startsWith(folder));
}

function flaggedLines(file, repository) {
  const relativePath = repository.relative(file);
  return repository.lines(file)
    .map((line, index) => (isForegroundDispatch(line) ? `${relativePath}:${index + 1}` : null))
    .filter((entry) => entry !== null);
}

export function scanForegroundDispatches(repository) {
  const forked = forkedSkillFolders(repository);
  const files = SCANNED.flatMap((directory) => filesUnder(repository.join(directory)));
  const scanned = files.filter((file) => !isSkipped(file, forked));
  return { flagged: scanned.flatMap((file) => flaggedLines(file, repository)) };
}

export function checkForegroundDispatch(report, repository) {
  const { flagged } = scanForegroundDispatches(repository);
  report.assert(
    flagged.length === 0,
    'foreground dispatch',
    'no lead-run text tells an Agent call to run in the foreground',
    `${flagged.join(', ')} tell an Agent call to run in the foreground; the lead dispatches in the background and waits for the completion notification`
  );
}
