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

export function scanForegroundDispatches(repository) {
  const flagged = [];
  const forked = forkedSkillFolders(repository);
  for (const directory of SCANNED) {
    for (const file of filesUnder(repository.join(directory))) {
      if (forked.some((folder) => file.startsWith(folder))) continue;
      const relativePath = repository.relative(file);
      repository.lines(file).forEach((line, index) => {
        if (!isForegroundDispatch(line)) return;
        flagged.push(`${relativePath}:${index + 1}`);
      });
    }
  }
  return { flagged };
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
